<#import "template.ftl" as layout>
<@layout.registrationLayout displayMessage=false; section>
  <#if section = "header">
    <h2 class="pr-title">Signing out</h2>
    <p class="pr-subtitle">Ending your Physical Risk SSO session…</p>
  <#elseif section = "form">
    <div class="pr-alert pr-alert--info" role="status">
      Please wait — you will be redirected automatically.
    </div>
    <form id="kc-logout-confirm" class="pr-form" action="${url.logoutConfirmAction}" method="POST">
      <input type="hidden" name="session_code" value="${logoutConfirm.code}">
      <button
        class="pr-btn"
        name="confirmLogout"
        id="kc-logout"
        type="submit"
        tabindex="4"
        style="display:none"
      >${msg("doLogout")}</button>
    </form>
    <script>
      document.getElementById("kc-logout-confirm").submit();
    </script>
    <noscript>
      <form class="pr-form" action="${url.logoutConfirmAction}" method="POST" style="margin-top:1rem">
        <input type="hidden" name="session_code" value="${logoutConfirm.code}">
        <button class="pr-btn" name="confirmLogout" type="submit">${msg("doLogout")}</button>
      </form>
    </noscript>
  </#if>
</@layout.registrationLayout>
