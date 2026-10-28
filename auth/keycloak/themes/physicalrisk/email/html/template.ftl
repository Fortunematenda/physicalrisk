<#macro emailLayout>
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Physical Risk</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f6f8;font-family:Arial,Helvetica,sans-serif;color:#0f1419;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f4f6f8;">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background-color:#ffffff;border:1px solid #e4e8ee;border-radius:8px;overflow:hidden;">
          <tr>
            <td style="height:6px;background-color:#c41230;font-size:0;line-height:0;">&nbsp;</td>
          </tr>
          <tr>
            <td style="padding:28px 40px 20px 40px;border-bottom:1px solid #e4e8ee;">
              <img src="${(properties.logoUrl)!'https://moss.physicalrisk.com/physical_risk_logo_main.png'}" width="220" alt="Physical Risk – security matters" style="display:block;width:220px;max-width:100%;height:auto;border:0;">
            </td>
          </tr>
          <tr>
            <td style="padding:32px 40px;font-size:15px;line-height:1.6;color:#3d4654;">
              <#nested>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 40px;background-color:#121820;font-size:12px;line-height:1.5;color:#c9d0da;">
              <strong style="color:#ffffff;">Physical Risk</strong> &middot; security matters<br>
              This is an automated message about your Physical Risk account. Please do not reply to it.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
</#macro>
