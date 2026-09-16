require('dotenv').config();

const express = require('express');
const session = require('express-session');
const multer = require('multer');
const { Pool } = require('pg');
const { Resend } = require('resend');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

const resend = new Resend(process.env.RESEND_API_KEY);

// ======================================================
// Render / Proxy
// ======================================================

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
// DB初期化
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

app.use(express.json());

app.use(session({
  secret:
    process.env.SESSION_SECRET ||
    'edit-lab-session-secret-change-me',

  resave: false,
  saveUninitialized: false,

  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 1000 * 60 * 60 * 12
  }
}));

// ======================================================
// Multer
// ======================================================

const storage = multer.diskStorage({

  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },

  filename: function (req, file, cb) {

    const ext = path.extname(file.originalname);

    const filename =
      Date.now() +
      '-' +
      Math.random()
        .toString(36)
        .substring(2, 10) +
      ext;

    cb(null, filename);
  }

});

const upload = multer({
  storage,
  limits: {
    fileSize: 1024 * 1024 * 1024
  }
});

// ======================================================
// 管理者認証
// ======================================================

function requireAdmin(req, res, next) {

  if (!req.session.admin) {
    return res.redirect('/admin/login');
  }

  next();
}

// ======================================================
// HTML共通
// ======================================================

function escapeHtml(value) {

  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function layout(title, body) {

  return `
<!DOCTYPE html>

<html lang="ja">

<head>

<meta charset="UTF-8">

<meta
  name="viewport"
  content="width=device-width, initial-scale=1.0"
>

<title>${escapeHtml(title)}</title>

<style>

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  font-family:
    -apple-system,
    BlinkMacSystemFont,
    "Segoe UI",
    "Noto Sans JP",
    sans-serif;

  background: #ffffff;
  color: #111111;
}

a {
  color: inherit;
}

.header {

  height: 72px;

  border-bottom:
    1px solid #eeeeee;

  display: flex;
  align-items: center;
  justify-content: space-between;

  padding:
    0 6vw;

  background:
    rgba(255,255,255,.96);

  position:
    sticky;

  top: 0;

  z-index: 100;
}

.logo {

  font-weight: 800;

  letter-spacing:
    .12em;

  text-decoration: none;
}

.nav {

  display: flex;

  align-items: center;

  gap: 26px;

  font-size:
    14px;
}

.nav a {

  text-decoration:
    none;
}

.container {

  width:
    min(1040px, 90%);

  margin:
    0 auto;
}

.hero {

  padding:
    110px 0 80px;
}

.eyebrow {

  font-size:
    12px;

  letter-spacing:
    .22em;

  font-weight:
    700;

  color:
    #666;
}

h1 {

  font-size:
    clamp(
      38px,
      6vw,
      76px
    );

  line-height:
    1.05;

  margin:
    20px 0;
}

h2 {

  font-size:
    34px;

  margin:
    0 0 25px;
}

p {

  line-height:
    1.8;
}

.button {

  display:
    inline-flex;

  align-items:
    center;

  justify-content:
    center;

  min-height:
    48px;

  padding:
    0 24px;

  border:
    1px solid #111;

  border-radius:
    999px;

  background:
    #111;

  color:
    white;

  text-decoration:
    none;

  cursor:
    pointer;

  font-weight:
    700;
}

.button.white {

  background:
    white;

  color:
    #111;
}

.section {

  padding:
    80px 0;
}

.grid {

  display:
    grid;

  grid-template-columns:
    repeat(
      3,
      minmax(0, 1fr)
    );

  gap:
    20px;
}

.card {

  border:
    1px solid #e7e7e7;

  border-radius:
    20px;

  padding:
    28px;

  background:
    #fff;
}

.card h3 {

  margin-top:
    0;

  font-size:
    22px;
}

.form {

  max-width:
    760px;
}

.field {

  margin-bottom:
    24px;
}

label {

  display:
    block;

  font-weight:
    700;

  margin-bottom:
    8px;
}

input,
select,
textarea {

  width:
    100%;

  border:
    1px solid #ccc;

  border-radius:
    12px;

  padding:
    14px 16px;

  font:
    inherit;

  background:
    #fff;
}

textarea {

  min-height:
    160px;

  resize:
    vertical;
}

.notice {

  background:
    #f7f7f7;

  border-radius:
    16px;

  padding:
    18px 20px;

  margin:
    20px 0;
}

.admin-card {

  border:
    1px solid #e4e4e4;

  border-radius:
    18px;

  padding:
    22px;

  margin-bottom:
    18px;
}

.admin-top {

  display:
    flex;

  align-items:
    flex-start;

  justify-content:
    space-between;

  gap:
    20px;
}

.badge {

  display:
    inline-block;

  background:
    #111;

  color:
    #fff;

  border-radius:
    999px;

  padding:
    4px 10px;

  font-size:
    11px;

  margin-bottom:
    10px;
}

.info-grid {

  display:
    grid;

  grid-template-columns:
    repeat(
      4,
      minmax(0, 1fr)
    );

  gap:
    10px;

  margin-top:
    16px;
}

.info {

  background:
    #f7f7f7;

  border-radius:
    12px;

  padding:
    12px;
}

.info strong {

  display:
    block;

  font-size:
    12px;

  color:
    #666;

  margin-bottom:
    5px;
}

.message {

  margin-top:
    14px;

  background:
    #fafafa;

  border-radius:
    12px;

  padding:
    16px;

  white-space:
    pre-wrap;
}

.small {

  color:
    #666;

  font-size:
    14px;
}

.footer {

  border-top:
    1px solid #eee;

  margin-top:
    80px;

  padding:
    35px 0;

  color:
    #666;

  font-size:
    13px;
}

.login-wrap {

  min-height:
    calc(100vh - 72px);

  display:
    grid;

  place-items:
    center;

  padding:
    30px;
}

.login-card {

  width:
    min(540px, 100%);

  border:
    1px solid #e5e5e5;

  border-radius:
    20px;

  padding:
    44px;
}

.status-form {

  display:
    flex;

  gap:
    8px;
}

.status-form select {

  min-width:
    100px;
}

.status-form button {

  border:
    1px solid #ddd;

  background:
    white;

  border-radius:
    8px;

  padding:
    8px 12px;

  cursor:
    pointer;
}

.error {

  color:
    #b00020;

  margin:
    15px 0;
}

@media (
  max-width: 800px
) {

  .grid {
    grid-template-columns:
      1fr;
  }

  .info-grid {
    grid-template-columns:
      1fr 1fr;
  }

  .admin-top {
    flex-direction:
      column;
  }

}

</style>

</head>

<body>

<header class="header">

<a
  class="logo"
  href="/"
>
EDIT LAB
</a>

<nav class="nav">

<a href="/">ホーム</a>

<a href="/request">
依頼する
</a>

</nav>

</header>

${body}

</body>

</html>
`;
}

// ======================================================
// Resend メール通知
// ======================================================

async function notify(r) {

  if (
    !process.env.RESEND_API_KEY ||
    !process.env.NOTIFY_EMAIL
  ) {

    console.log(
      'RESEND_API_KEY または NOTIFY_EMAIL が設定されていないためメール通知をスキップしました。'
    );

    return;
  }

  try {

    const result =
      await resend.emails.send({

        from:
          'EDIT LAB <onboarding@resend.dev>',

        to: [
          process.env.NOTIFY_EMAIL
        ],

        subject:
          `【動画編集依頼】${r.name}様から新規依頼`,

        text:
`新しい動画編集依頼が届きました。

依頼ID:
${r.id}

お名前:
${r.name}

メール:
${r.email}

種類:
${r.type || '未指定'}

プラン:
${r.plan || '未指定'}

納期:
${r.deadline || '未指定'}

予算:
${r.budget || '未指定'}

ファイル:
${r.originalname || 'なし'}

内容:
${r.message || 'なし'}

----------------------------

EDIT LAB 管理画面

https://video-editing-site.onrender.com/admin
`

      });

    if (result.error) {

      console.error(
        'Resend email failed:',
        result.error
      );

      return;
    }

    console.log(
      'Resend email sent:',
      result.data
    );

  } catch (error) {

    console.error(
      'Resend email failed:',
      error
    );
  }
}

// ======================================================
// TOP
// ======================================================

app.get('/', (req, res) => {

  res.send(
    layout(
      'EDIT LAB | 動画編集サービス',
      `

<main>

<section class="hero">

<div class="container">

<div class="eyebrow">
VIDEO EDITING SERVICE
</div>

<h1>
あなたの映像を、<br>
もっと伝わる形へ。
</h1>

<p>
YouTube・SNS・ショート動画など、
目的に合わせた動画編集を承ります。
</p>

<p style="margin-top:30px">

<a
  class="button"
  href="/request"
>
動画編集を依頼する
</a>

</p>

</div>

</section>

<section class="section">

<div class="container">

<div class="eyebrow">
SERVICE
</div>

<h2>
対応サービス
</h2>

<div class="grid">

<div class="card">

<h3>YouTube編集</h3>

<p>
カット、テロップ、
BGM、SEなどを含む
YouTube向け動画編集。
</p>

</div>

<div class="card">

<h3>ショート動画</h3>

<p>
TikTok・YouTube Shorts・
Instagram Reels向けの
縦型動画編集。
</p>

</div>

<div class="card">

<h3>SNS / PR動画</h3>

<p>
商品紹介やサービス紹介など、
目的に合わせた動画を制作します。
</p>

</div>

</div>

</div>

</section>

<section class="section">

<div class="container">

<div class="eyebrow">
REQUEST
</div>

<h2>
編集のご依頼
</h2>

<p>
動画の種類・納期・予算などを
フォームからお送りください。
</p>

<a
  class="button"
  href="/request"
>
依頼フォームへ
</a>

</div>

</section>

</main>

<footer class="footer">

<div class="container">

© EDIT LAB

</div>

</footer>
`
    )
  );
});

// ======================================================
// 依頼フォーム
// ======================================================

app.get('/request', (req, res) => {

  res.send(
    layout(
      '動画編集のご依頼 | EDIT LAB',
      `

<main class="section">

<div class="container">

<div class="eyebrow">
REQUEST
</div>

<h2>
動画編集のご依頼
</h2>

<p>
内容を確認後、
ご入力いただいたメールアドレスへ
ご連絡いたします。
</p>

<form
  class="form"
  action="/request"
  method="POST"
  enctype="multipart/form-data"
>

<div class="field">

<label>
お名前 *
</label>

<input
  type="text"
  name="name"
  required
>

</div>

<div class="field">

<label>
メールアドレス *
</label>

<input
  type="email"
  name="email"
  required
>

</div>

<div class="field">

<label>
動画の種類
</label>

<select name="type">

<option value="">
選択してください
</option>

<option value="YouTube">
YouTube
</option>

<option value="ショート動画">
ショート動画
</option>

<option value="SNS動画">
SNS動画
</option>

<option value="PR動画">
PR動画
</option>

<option value="その他">
その他
</option>

</select>

</div>

<div class="field">

<label>
プラン
</label>

<select name="plan">

<option value="未定・相談したい">
未定・相談したい
</option>

<option value="ライト">
ライト
</option>

<option value="スタンダード">
スタンダード
</option>

<option value="プレミアム">
プレミアム
</option>

</select>

</div>

<div class="field">

<label>
希望納期
</label>

<input
  type="text"
  name="deadline"
  placeholder="例：1週間以内"
>

</div>

<div class="field">

<label>
予算
</label>

<input
  type="text"
  name="budget"
  placeholder="例：1万円前後"
>

</div>

<div class="field">

<label>
依頼内容 *
</label>

<textarea
  name="message"
  required
  placeholder="編集内容やご希望をご記入ください"
></textarea>

</div>

<div class="field">

<label>
動画ファイル
</label>

<input
  type="file"
  name="video"
>

<p class="small">
大容量ファイルの場合は
アップロードに時間がかかる場合があります。
</p>

</div>

<button
  class="button"
  type="submit"
>
依頼を送信する
</button>

</form>

</div>

</main>
`
    )
  );
});

// ======================================================
// 依頼受付
// ======================================================

app.post(
  '/request',
  upload.single('video'),
  async (req, res) => {

    try {

      const {
        name,
        email,
        type,
        plan,
        deadline,
        budget,
        message
      } = req.body;

      if (
        !name ||
        !email ||
        !message
      ) {

        return res
          .status(400)
          .send(
            '必須項目を入力してください。'
          );
      }

      const filename =
        req.file
          ? req.file.filename
          : null;

      const originalname =
        req.file
          ? req.file.originalname
          : null;

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
          (
            $1,$2,$3,$4,$5,
            $6,$7,$8,$9
          )
          RETURNING *
          `,
          [
            name,
            email,
            type || '',
            plan || '',
            deadline || '',
            budget || '',
            message,
            filename,
            originalname
          ]
        );

      const requestData =
        result.rows[0];

      // メール通知
      // 失敗しても依頼自体は保存済みなので
      // フォーム送信を失敗扱いにしない
      await notify(requestData);

      res.send(
        layout(
          '送信完了 | EDIT LAB',
          `

<main class="section">

<div class="container">

<div class="eyebrow">
THANK YOU
</div>

<h2>
送信が完了しました。
</h2>

<p>
ご依頼ありがとうございます。<br>
内容を確認後、
ご入力いただいたメールアドレスへ
ご連絡いたします。
</p>

<p style="margin-top:30px">

<a
  class="button"
  href="/"
>
トップへ戻る
</a>

</p>

</div>

</main>
`
        )
      );

    } catch (error) {

      console.error(
        'Request save error:',
        error
      );

      res
        .status(500)
        .send(
          '依頼の送信中にエラーが発生しました。'
        );
    }
  }
);

// ======================================================
// 管理画面ログイン
// ======================================================

app.get(
  '/admin/login',
  (req, res) => {

    const error =
      req.query.error
        ? '<div class="error">パスワードが違います。</div>'
        : '';

    res.send(
      layout(
        '管理画面ログイン',
        `

<div class="login-wrap">

<div class="login-card">

<div class="eyebrow">
ADMIN
</div>

<h2>
管理画面
</h2>

${error}

<form
  action="/admin/login"
  method="POST"
>

<div class="field">

<label>
パスワード
</label>

<input
  type="password"
  name="password"
  required
>

</div>

<button
  class="button"
  style="width:100%"
  type="submit"
>
ログイン
</button>

</form>

</div>

</div>
`
      )
    );
  }
);

app.post(
  '/admin/login',
  (req, res) => {

    const password =
      req.body.password;

    if (
      !process.env.ADMIN_PASSWORD
    ) {

      return res
        .status(500)
        .send(
          'ADMIN_PASSWORD が設定されていません。'
        );
    }

    if (
      password ===
      process.env.ADMIN_PASSWORD
    ) {

      req.session.admin = true;

      return res.redirect(
        '/admin'
      );
    }

    res.redirect(
      '/admin/login?error=1'
    );
  }
);

// ======================================================
// ログアウト
// ======================================================

app.get(
  '/admin/logout',
  (req, res) => {

    req.session.destroy(
      () => {

        res.redirect(
          '/admin/login'
        );
      }
    );
  }
);

// ======================================================
// 管理画面
// ======================================================

app.get(
  '/admin',
  requireAdmin,
  async (req, res) => {

    try {

      const result =
        await db.query(
          `
          SELECT *
          FROM requests
          ORDER BY created_at DESC
          `
        );

      const requests =
        result.rows;

      const cards =
        requests
          .map(r => {

            const created =
              new Date(
                r.created_at
              )
                .toLocaleString(
                  'ja-JP',
                  {
                    timeZone:
                      'Asia/Tokyo'
                  }
                );

            const fileButton =
              r.filename
                ? `
                <p>
                <a
                  href="/admin/download/${r.id}"
                >
                  ${escapeHtml(
                    r.originalname ||
                    'ファイルをダウンロード'
                  )}
                </a>
                </p>
                `
                : '';

            return `

<div class="admin-card">

<div class="admin-top">

<div>

<span class="badge">
${escapeHtml(
  r.status || 'new'
)}
</span>

<h3>
#${r.id}
${escapeHtml(r.name)}
</h3>

<div class="small">

${escapeHtml(created)}
・

<a href="mailto:${escapeHtml(r.email)}">
${escapeHtml(r.email)}
</a>

</div>

</div>

<form
  class="status-form"
  action="/admin/status/${r.id}"
  method="POST"
>

<select name="status">

<option
  value="new"
  ${r.status === 'new'
    ? 'selected'
    : ''}
>
new
</option>

<option
  value="checking"
  ${r.status === 'checking'
    ? 'selected'
    : ''}
>
checking
</option>

<option
  value="contacted"
  ${r.status === 'contacted'
    ? 'selected'
    : ''}
>
contacted
</option>

<option
  value="working"
  ${r.status === 'working'
    ? 'selected'
    : ''}
>
working
</option>

<option
  value="done"
  ${r.status === 'done'
    ? 'selected'
    : ''}
>
done
</option>

</select>

<button type="submit">
更新
</button>

</form>

</div>

<div class="info-grid">

<div class="info">

<strong>
種類
</strong>

${escapeHtml(
  r.type || '未指定'
)}

</div>

<div class="info">

<strong>
プラン
</strong>

${escapeHtml(
  r.plan || '未指定'
)}

</div>

<div class="info">

<strong>
納期
</strong>

${escapeHtml(
  r.deadline || '未指定'
)}

</div>

<div class="info">

<strong>
予算
</strong>

${escapeHtml(
  r.budget || '未指定'
)}

</div>

</div>

<div class="message">
${escapeHtml(
  r.message || ''
)}
</div>

${fileButton}

</div>
`;
          })
          .join('');

      res.send(
        layout(
          '依頼管理 | EDIT LAB',
          `

<main class="section">

<div class="container">

<div
  style="
    display:flex;
    justify-content:space-between;
    align-items:flex-start;
    gap:20px;
  "
>

<div>

<div class="eyebrow">
DASHBOARD
</div>

<h2>
依頼管理
</h2>

<p>
${requests.length}件の依頼
</p>

</div>

<div>

<a
  class="button white"
  href="/"
  target="_blank"
>
サイトを見る
</a>

</div>

</div>

<div style="margin-top:40px">

${cards || `

<div class="notice">
まだ依頼はありません。
</div>

`}

</div>

</div>

</main>

<footer class="footer">

<div class="container">

<a href="/admin/logout">
ログアウト
</a>

</div>

</footer>
`
        )
      );

    } catch (error) {

      console.error(
        'Admin error:',
        error
      );

      res
        .status(500)
        .send(
          '管理画面の読み込みに失敗しました。'
        );
    }
  }
);

// ======================================================
// ステータス更新
// ======================================================

app.post(
  '/admin/status/:id',
  requireAdmin,
  async (req, res) => {

    try {

      const allowed =
        [
          'new',
          'checking',
          'contacted',
          'working',
          'done'
        ];

      const status =
        allowed.includes(
          req.body.status
        )
          ? req.body.status
          : 'new';

      await db.query(
        `
        UPDATE requests
        SET status = $1
        WHERE id = $2
        `,
        [
          status,
          req.params.id
        ]
      );

      res.redirect(
        '/admin'
      );

    } catch (error) {

      console.error(
        'Status update error:',
        error
      );

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
  '/admin/download/:id',
  requireAdmin,
  async (req, res) => {

    try {

      const result =
        await db.query(
          `
          SELECT
            filename,
            originalname
          FROM requests
          WHERE id = $1
          `,
          [
            req.params.id
          ]
        );

      if (
        result.rows.length === 0
      ) {

        return res
          .status(404)
          .send(
            '依頼が見つかりません。'
          );
      }

      const requestData =
        result.rows[0];

      if (
        !requestData.filename
      ) {

        return res
          .status(404)
          .send(
            'ファイルがありません。'
          );
      }

      const filePath =
        path.join(
          uploadDir,
          requestData.filename
        );

      if (
        !fs.existsSync(filePath)
      ) {

        return res
          .status(404)
          .send(
            'アップロードファイルがサーバー上にありません。'
          );
      }

      res.download(
        filePath,
        requestData.originalname ||
        requestData.filename
      );

    } catch (error) {

      console.error(
        'Download error:',
        error
      );

      res
        .status(500)
        .send(
          'ダウンロードに失敗しました。'
        );
    }
  }
);

// ======================================================
// 404
// ======================================================

app.use(
  (req, res) => {

    res
      .status(404)
      .send(
        layout(
          'ページが見つかりません',
          `

<main class="section">

<div class="container">

<h2>
ページが見つかりません。
</h2>

<a
  class="button"
  href="/"
>
トップへ戻る
</a>

</div>

</main>
`
        )
      );
  }
);

// ======================================================
// 起動
// ======================================================

initDatabase()
  .then(() => {

    app.listen(
      PORT,
      '0.0.0.0',
      () => {

        console.log(
          `EDIT LAB running on port ${PORT}`
        );
      }
    );

  })
  .catch(error => {

    console.error(
      'Database initialization failed:',
      error
    );

    process.exit(1);
  });
