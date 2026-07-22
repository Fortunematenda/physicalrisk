<#import "template.ftl" as layout>
<@layout.registrationLayout displayMessage=!messagesPerField.existsError('username','password') displayInfo=realm.password && realm.registrationAllowed && !registrationDisabled??; section>
  <#if section = "header">
    <h2 class="pr-title">Sign in</h2>
    <p class="pr-subtitle">Use your Physical Risk account to continue.</p>
  <#elseif section = "form">
    <#if realm.password>
      <form id="kc-form-login" class="pr-form" onsubmit="login.disabled = true; return true;" action="${url.loginAction}" method="post">
        <div class="pr-field">
          <label for="username" class="pr-label">
            <#if !realm.loginWithEmailAllowed>${msg("username")}<#elseif !realm.registrationEmailAsUsername>${msg("usernameOrEmail")}<#else>${msg("email")}</#if>
          </label>
          <input
            tabindex="1"
            id="username"
            class="pr-input"
            name="username"
            value="${(login.username!'')}"
            type="text"
            autofocus
            autocomplete="username"
            aria-invalid="<#if messagesPerField.existsError('username','password')>true</#if>"
          />
          <#if messagesPerField.existsError('username','password')>
            <span class="pr-field-error" aria-live="polite">
              ${kcSanitize(messagesPerField.getFirstError('username','password'))?no_esc}
            </span>
          </#if>
        </div>

        <div class="pr-field">
          <div class="pr-label-row">
            <label for="password" class="pr-label">${msg("password")}</label>
            <#if realm.resetPasswordAllowed>
              <a tabindex="5" class="pr-link" href="${url.loginResetCredentialsUrl}">${msg("doForgotPassword")}</a>
            </#if>
          </div>
          <input
            tabindex="2"
            id="password"
            class="pr-input"
            name="password"
            type="password"
            autocomplete="current-password"
            aria-invalid="<#if messagesPerField.existsError('username','password')>true</#if>"
          />
        </div>

        <div class="pr-row">
          <#if realm.rememberMe && !usernameHidden??>
            <label class="pr-check">
              <input tabindex="3" id="rememberMe" name="rememberMe" type="checkbox" <#if login.rememberMe??>checked</#if>/>
              <span>${msg("rememberMe")}</span>
            </label>
          <#else>
            <span></span>
          </#if>
        </div>

        <input type="hidden" id="id-hidden-input" name="credentialId" <#if auth.selectedCredential?has_content>value="${auth.selectedCredential}"</#if>/>

        <button tabindex="4" class="pr-btn" name="login" id="kc-login" type="submit">
          ${msg("doLogIn")}
        </button>
      </form>
    </#if>
  <#elseif section = "info">
    <#if realm.password && realm.registrationAllowed && !registrationDisabled??>
      <p class="pr-register">
        ${msg("noAccount")}
        <a tabindex="6" class="pr-link" href="${url.registrationUrl}">${msg("doRegister")}</a>
      </p>
    </#if>
  </#if>
</@layout.registrationLayout>
