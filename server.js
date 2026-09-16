require('dotenv').config();

const express = require('express');
const session = require('express-session');
const multer = require('multer');
const { Pool } = require('pg');
const nodemailer = require('nodemailer');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// ======================================================
// Render / Proxy 設定
// ======================================================

// Render はリバースプロキシ経由なので必要
app.set('trust proxy', 1);

// ======================================================
// Neon PostgreSQL
// ======================================================

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL が設定されていません。');
  process.exit(1);
}

const db = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

// ======================================================
// アップロードフォルダ
// ======================================================

const uploadDir = path.join(__dirname, 'uploads');

fs.mkdirSync(uploadDir, {
  recursive: true
});

// ======================================================
// DB 初期化
// ======================================================

async function initDatabase() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS requests (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      type TEXT,
      plan TEXT,
      deadline TEXT,
      budget TEXT,
      message TEXT,
      filename TEXT,
      originalname TEXT,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      status TEXT DEFAULT 'new'
    )
  `);

  console.log('Neon PostgreSQL connected');
}

// ======================================================
// Express
// ======================================================

app.use(express.urlencoded({
  extended: true
}));

// ======================================================
// セッション
// ======================================================

app.use(session({
  secret: process.env.SESSION_SECRET || 'dev-secret-change-me',

  resave: false,
  saveUninitialized: false,

  // Render の HTTPS / Proxy 対応
  proxy: true,

  cookie: {
    httpOnly: true,
    sameSite: 'lax',

    // Render は HTTPS
    secure: process.env.NODE_ENV === 'production',

    maxAge: 8 * 60 * 60 * 1000
  }
}));

// ======================================================
// public
// ======================================================

app.use(express.static(
  path.join(__dirname, 'public')
));

// ======================================================
// 動画アップロード
// ======================================================

const allowed = [
  '.mp4',
  '.mov',
  '.m4v',
  '.avi',
  '.mkv',
  '.webm'
];

const storage = multer.diskStorage({

  destination: uploadDir,

  filename: (req, file, cb) => {

    const filename =
      Date.now() +
      '-' +
      Math.random().toString(36).slice(2) +
      path.extname(file.originalname).toLowerCase();

    cb(null, filename);
  }

});

const upload = multer({

  storage,

  limits: {
    fileSize: 2 * 1024 * 1024 * 1024
  },

  fileFilter: (req, file, cb) => {

    const ext =
      path.extname(file.originalname).toLowerCase();

    if (allowed.includes(ext)) {

      cb(null, true);

    } else {

      cb(
        new Error(
          '動画ファイルは mp4 / mov / m4v / avi / mkv / webm のみ対応です。'
        )
      );

    }
  }

});

// ======================================================
// 管理画面認証
// ======================================================

function auth(req, res, next) {

  if (req.session && req.session.admin === true) {
    return next();
  }

  res.redirect('/admin/login');
}

// ======================================================
// メール通知
// ======================================================

async function notify(r) {

  if (
    !process.env.SMTP_HOST ||
    !process.env.NOTIFY_EMAIL
  ) {
    return;
  }

  const transporter =
    nodemailer.createTransport({

      host: process.env.SMTP_HOST,

      port: Number(
        process.env.SMTP_PORT || 587
      ),

      secure:
        String(process.env.SMTP_SECURE) === 'true',

      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      }

    });

  await transporter.sendMail({

    from: process.env.SMTP_USER,

    to: process.env.NOTIFY_EMAIL,

    subject:
      `【動画編集依頼】${r.name}様から新規依頼`,

    text:
`新しい依頼が届きました。

お名前: ${r.name}
メール: ${r.email}
種類: ${r.type}
プラン: ${r.plan}
納期: ${r.deadline}
予算: ${r.budget}
ファイル: ${r.originalname || 'なし'}

内容:
${r.message}

管理画面: /admin`

  });

}

// ======================================================
// 依頼受付
// ======================================================

app.post(
  '/api/requests',

  upload.single('video'),

  async (req, res) => {

    try {

      const r = {

        ...req.body,

        filename:
          req.file?.filename || '',

        originalname:
          req.file?.originalname || ''

      };

      if (
        !r.name ||
        !r.email ||
        !r.message
      ) {

        throw new Error(
          '必須項目が不足しています。'
        );

      }

      const result =
        await db.query(
          `
          INSERT INTO requests
          (
            name,
            email,
            type,
            plan,
            deadline,
            budget,
            message,
            filename,
            originalname
          )

          VALUES
          ($1,$2,$3,$4,$5,$6,$7,$8,$9)

          RETURNING id
          `,
          [
            r.name,
            r.email,
            r.type || '',
            r.plan || '',
            r.deadline || '',
            r.budget || '',
            r.message,
            r.filename,
            r.originalname
          ]
        );

      r.id =
        result.rows[0].id;

      try {

        await notify(r);

      } catch (e) {

        console.error(
          'Email notification failed:',
          e.message
        );

      }

      res.send(`
<!doctype html>

<meta charset="utf-8">

<title>
送信完了
</title>

<link
rel="stylesheet"
href="/style.css"
>

<main class="result">

<div class="result-card">

<p class="eyebrow">
THANK YOU
</p>

<h1>
お問い合わせを受け付けました。
</h1>

<p>
ご依頼内容を確認のうえ、
担当者からご連絡します。
</p>

<a
class="btn primary"
href="/"
>
トップへ戻る
</a>

</div>

</main>
      `);

    } catch (e) {

      console.error(e);

      res.status(400).send(`
<!doctype html>

<meta charset="utf-8">

<link
rel="stylesheet"
href="/style.css"
>

<main class="result">

<div class="result-card">

<h1>
送信できませんでした
</h1>

<p>
${String(e.message).replace(/[<>]/g, '')}
</p>

<a
class="btn secondary"
href="/"
>
戻る
</a>

</div>

</main>
      `);

    }

  }
);

// ======================================================
// 管理画面ログイン
// ======================================================

app.get(
  '/admin/login',

  (req, res) => {

    // すでにログイン済みなら管理画面へ
    if (
      req.session &&
      req.session.admin === true
    ) {

      return res.redirect('/admin');

    }

    res.send(`
<!doctype html>

<meta charset="utf-8">

<title>
管理画面ログイン
</title>

<link
rel="stylesheet"
href="/style.css"
>

<main class="result">

<form
class="login-card"
method="post"
action="/admin/login"
>

<p class="eyebrow">
ADMIN
</p>

<h1>
管理画面
</h1>

<label>

パスワード

<input
type="password"
name="password"
required
autofocus
autocomplete="current-password"
>

</label>

<button
class="btn primary submit"
type="submit"
>
ログイン
</button>

</form>

</main>
    `);

  }
);

// ======================================================
// 管理画面ログイン処理
// ======================================================

app.post(
  '/admin/login',

  (req, res) => {

    const enteredPassword =
      String(req.body.password || '');

    const adminPassword =
      String(process.env.ADMIN_PASSWORD || '');

    // Render に ADMIN_PASSWORD がない場合
    if (!adminPassword) {

      console.error(
        'ADMIN_PASSWORD が設定されていません。'
      );

      return res
        .status(500)
        .send(`
<meta charset="utf-8">

<h2>
管理画面の設定エラー
</h2>

<p>
ADMIN_PASSWORD が設定されていません。
</p>

<a href="/admin/login">
戻る
</a>
        `);

    }

    // パスワード不一致
    if (
      enteredPassword !== adminPassword
    ) {

      return res
        .status(401)
        .send(`
<meta charset="utf-8">

<h2>
パスワードが違います。
</h2>

<a href="/admin/login">
戻る
</a>
        `);

    }

    // ログイン成功
    req.session.admin = true;

    // セッションを保存してから移動
    req.session.save(err => {

      if (err) {

        console.error(
          'Session save error:',
          err
        );

        return res
          .status(500)
          .send(`
<meta charset="utf-8">

<h2>
ログイン処理に失敗しました。
</h2>

<a href="/admin/login">
戻る
</a>
          `);

      }

      res.redirect('/admin');

    });

  }
);

// ======================================================
// ログアウト
// ======================================================

app.post(
  '/admin/logout',

  auth,

  (req, res) => {

    req.session.destroy(
      () => {

        res.clearCookie(
          'connect.sid'
        );

        res.redirect('/');

      }
    );

  }
);

// ======================================================
// 管理画面
// ======================================================

app.get(
  '/admin',

  auth,

  async (req, res) => {

    try {

      const result =
        await db.query(`
          SELECT *
          FROM requests
          ORDER BY id DESC
        `);

      const rows =
        result.rows;

      const esc = s =>
        String(s ?? '')
          .replace(
            /[&<>"']/g,

            c => ({
              '&': '&amp;',
              '<': '&lt;',
              '>': '&gt;',
              '"': '&quot;',
              "'": '&#39;'
            }[c])
          );

      const list =
        rows
          .map(
            r => `

<article class="request">

<div class="request-top">

<div>

<span class="status">
${esc(r.status)}
</span>

<h2>
#${r.id} ${esc(r.name)}
</h2>

<p>

${esc(
  r.created_at instanceof Date
    ? r.created_at.toLocaleString(
        'ja-JP',
        {
          timeZone: 'Asia/Tokyo'
        }
      )
    : r.created_at
)}

·

<a href="mailto:${esc(r.email)}">
${esc(r.email)}
</a>

</p>

</div>

<form
method="post"
action="/admin/status"
>

<input
type="hidden"
name="id"
value="${r.id}"
>

<select name="status">

<option
${r.status === 'new'
  ? 'selected'
  : ''}
value="new"
>
new
</option>

<option
${r.status === 'in_progress'
  ? 'selected'
  : ''}
value="in_progress"
>
in_progress
</option>

<option
${r.status === 'done'
  ? 'selected'
  : ''}
value="done"
>
done
</option>

</select>

<button type="submit">
更新
</button>

</form>

</div>

<div class="request-grid">

<p>
<b>種類</b><br>
${esc(r.type)}
</p>

<p>
<b>プラン</b><br>
${esc(r.plan)}
</p>

<p>
<b>納期</b><br>
${esc(r.deadline)}
</p>

<p>
<b>予算</b><br>
${esc(r.budget)}
</p>

</div>

<p class="message">
${esc(r.message).replace(/\n/g, '<br>')}
</p>

${
  r.filename
    ? `
<p>
📎
<a
href="/admin/files/${encodeURIComponent(r.filename)}"
>
${esc(r.originalname)}
</a>
</p>
`
    : ''
}

</article>

            `
          )
          .join('');

      res.send(`
<!doctype html>

<meta charset="utf-8">

<title>
依頼管理
</title>

<link
rel="stylesheet"
href="/style.css"
>

<header class="header">

<a
class="logo"
href="/"
>
EDIT LAB
</a>

<div>

管理画面

<form
style="display:inline"
method="post"
action="/admin/logout"
>

<button
class="logout"
type="submit"
>
ログアウト
</button>

</form>

</div>

</header>

<main class="admin">

<div class="admin-head">

<div>

<p class="eyebrow">
DASHBOARD
</p>

<h1>
依頼管理
</h1>

<p>
${rows.length}件の依頼
</p>

</div>

<a
class="btn secondary"
href="/"
>
サイトを見る
</a>

</div>

${
  list ||
  '<div class="empty">まだ依頼はありません。</div>'
}

</main>
      `);

    } catch (e) {

      console.error(e);

      res
        .status(500)
        .send(
          'データベースの読み込みに失敗しました。'
        );

    }

  }
);

// ======================================================
// ステータス変更
// ======================================================

app.post(
  '/admin/status',

  auth,

  async (req, res) => {

    try {

      const allowedStatuses = [
        'new',
        'in_progress',
        'done'
      ];

      if (
        !allowedStatuses.includes(
          req.body.status
        )
      ) {

        return res
          .status(400)
          .send('不正なステータスです。');

      }

      await db.query(
        `
        UPDATE requests
        SET status = $1
        WHERE id = $2
        `,
        [
          req.body.status,
          req.body.id
        ]
      );

      res.redirect('/admin');

    } catch (e) {

      console.error(e);

      res
        .status(500)
        .send(
          'ステータス更新に失敗しました。'
        );

    }

  }
);

// ======================================================
// ファイルダウンロード
// ======================================================

app.get(
  '/admin/files/:name',

  auth,

  (req, res) => {

    const safe =
      path.basename(
        req.params.name
      );

    const filePath =
      path.join(
        uploadDir,
        safe
      );

    if (
      !fs.existsSync(filePath)
    ) {

      return res.sendStatus(404);

    }

    res.download(filePath);

  }
);

// ======================================================
// エラー処理
// ======================================================

app.use(
  (err, req, res, next) => {

    console.error(err);

    res
      .status(400)
      .send(
        '<p>' +
        String(err.message)
          .replace(/[<>]/g, '') +
        '</p>' +
        '<p><a href="/">戻る</a></p>'
      );

  }
);

// ======================================================
// 起動
// ======================================================

async function start() {

  try {

    await initDatabase();

    app.listen(
      PORT,

      () => {

        console.log(
          `EDIT LAB running on port ${PORT}`
        );

      }
    );

  } catch (e) {

    console.error(
      'Database startup error:',
      e
    );

    process.exit(1);

  }

}

start();
