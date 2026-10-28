<#import "template.ftl" as layout>
<#assign actions = requiredActions![]>
<#assign isSetup = actions?seq_contains("VERIFY_EMAIL")>
<#assign isPassword = actions?seq_contains("UPDATE_PASSWORD")>
<#assign firstName = (user.firstName)!"">
<@layout.emailLayout>
  <h1 style="margin:0 0 16px 0;font-size:22px;line-height:1.3;color:#0f1419;font-weight:bold;">
    <#if isSetup>Welcome to Physical Risk<#elseif isPassword>Reset your password<#else>Update your account</#if>
  </h1>
  <p style="margin:0 0 16px 0;">Hello<#if firstName?has_content> ${firstName}</#if>,</p>
  <#if isSetup>
    <p style="margin:0 0 16px 0;">An account has been created for you on the Physical Risk platform. To start, confirm your email address and choose your password.</p>
  <#elseif isPassword>
    <p style="margin:0 0 16px 0;">An administrator has asked you to choose a new password for your Physical Risk account. Your current password keeps working until you do.</p>
  <#else>
    <p style="margin:0 0 16px 0;">An administrator has asked you to update your Physical Risk account.</p>
  </#if>
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0;">
    <tr>
      <td style="border-radius:6px;background-color:#c41230;">
        <a href="${link}" target="_blank" rel="noopener" style="display:inline-block;padding:12px 28px;font-size:15px;font-weight:bold;color:#ffffff;text-decoration:none;border-radius:6px;">
          <#if isSetup>Set up my account<#elseif isPassword>Choose a new password<#else>Update my account</#if>
        </a>
      </td>
    </tr>
  </table>
  <p style="margin:0 0 16px 0;">This link expires in ${linkExpirationFormatter(linkExpiration)}.</p>
  <p style="margin:0 0 16px 0;font-size:13px;color:#6b7380;">If the button does not work, copy this address into your browser:<br>
    <a href="${link}" target="_blank" rel="noopener" style="color:#c41230;word-break:break-all;">${link}</a>
  </p>
  <p style="margin:24px 0 0 0;font-size:13px;color:#6b7380;">If you were not expecting this email, you can ignore it and nothing will change.</p>
</@layout.emailLayout>
