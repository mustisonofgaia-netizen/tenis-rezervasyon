export function renderPaymentSuccessPage(redirectUrl: string): string {
  return `<!DOCTYPE html>
<html lang="tr">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta http-equiv="refresh" content="0;url=${redirectUrl}" />
    <title>Ödeme Başarılı</title>
    <style>
      * { box-sizing: border-box; margin: 0; padding: 0; }
      body {
        min-height: 100vh;
        display: flex;
        align-items: center;
        justify-content: center;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        background: linear-gradient(180deg, #f0fdf4 0%, #f9fafb 100%);
        color: #111827;
        padding: 24px;
      }
      .card {
        width: 100%;
        max-width: 420px;
        background: #ffffff;
        border-radius: 24px;
        padding: 32px 28px;
        text-align: center;
        box-shadow: 0 20px 45px rgba(17, 24, 39, 0.08);
      }
      .icon {
        width: 72px;
        height: 72px;
        margin: 0 auto 20px;
        border-radius: 50%;
        background: #22c55e;
        color: #ffffff;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 36px;
        font-weight: 700;
      }
      h1 {
        font-size: 24px;
        margin-bottom: 12px;
        letter-spacing: -0.4px;
      }
      p {
        font-size: 15px;
        line-height: 1.6;
        color: #6b7280;
      }
      a {
        display: inline-block;
        margin-top: 24px;
        color: #22c55e;
        font-weight: 600;
        text-decoration: none;
      }
    </style>
  </head>
  <body>
    <div class="card">
      <div class="icon">✓</div>
      <h1>Ödeme Başarılı</h1>
      <p>Rezervasyonunuz onaylandı. Uygulamaya yönlendiriliyorsunuz...</p>
      <a href="${redirectUrl}">Devam Et</a>
    </div>
    <script>
      window.location.replace(${JSON.stringify(redirectUrl)});
    </script>
  </body>
</html>`;
}

export function renderPaymentFailurePage(message: string): string {
  return `<!DOCTYPE html>
<html lang="tr">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Ödeme Başarısız</title>
    <style>
      body {
        min-height: 100vh;
        display: flex;
        align-items: center;
        justify-content: center;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        background: #fef2f2;
        color: #111827;
        padding: 24px;
      }
      .card {
        width: 100%;
        max-width: 420px;
        background: #ffffff;
        border-radius: 24px;
        padding: 32px 28px;
        text-align: center;
        box-shadow: 0 20px 45px rgba(17, 24, 39, 0.08);
      }
      h1 { font-size: 24px; margin-bottom: 12px; }
      p { color: #6b7280; line-height: 1.6; }
    </style>
  </head>
  <body>
    <div class="card">
      <h1>Ödeme Tamamlanamadı</h1>
      <p>${message}</p>
    </div>
  </body>
</html>`;
}
