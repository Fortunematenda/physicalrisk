<#import "template.ftl" as layout>
<@layout.registrationLayout displayMessage=false; section>
  <#if section = "header">
    <h2 class="pr-title">Signing out</h2>
    <p class="pr-subtitle">Ending your Physical Risk SSO session…</p>
  <#elseif section = "form">
    <div class="pr-alert pr-alert--info" role="status">
      Please wait — you will be redirected automatically.
    </div>
    <#--
      Keycloak requires the confirmLogout field. Programmatic form.submit() does NOT
      include submit-button name/value, which caused "Logout failed". Use a hidden
      input and/or button.click() instead.
    -->
    <form id="kc-logout-confirm" class="pr-form" action="${url.logoutConfirmAction}" method="POST">
      <input type="hidden" name="session_code" value="${logoutConfirm.code}">
      <input type="hidden" name="confirmLogout" value="1">
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
      (function () {
        var btn = document.getElementById("kc-logout");
        if (btn && typeof btn.click === "function") {
          btn.click();
        } else {
          document.getElementById("kc-logout-confirm").submit();
        }
      })();
    </script>
    <noscript>
      <form class="pr-form" action="${url.logoutConfirmAction}" method="POST" style="margin-top:1rem">
        <input type="hidden" name="session_code" value="${logoutConfirm.code}">
        <input type="hidden" name="confirmLogout" value="1">
        <button class="pr-btn" name="confirmLogout" type="submit">${msg("doLogout")}</button>
      </form>
    </noscript>
  </#if>
</@layout.registrationLayout>
