<#import "template.ftl" as layout>
<@layout.registrationLayout displayMessage=!messagesPerField.existsError('password','password-confirm'); section>
  <#if section = "header">
    <h2 class="pr-title">Choose your password</h2>
    <p class="pr-subtitle">
      <#if (user.firstName)?? && user.firstName?has_content>Hi ${user.firstName}. </#if>Set a password for your Physical Risk account. You will use it with your email address to sign in.
    </p>
  <#elseif section = "form">
    <form id="kc-passwd-update-form" class="pr-form" action="${url.loginAction}" method="post" novalidate onsubmit="this.querySelector('#kc-update-password').disabled = true; return true;">
      <input type="text" id="username" name="username" value="${(username!'')}" autocomplete="username" readonly class="pr-visually-hidden" tabindex="-1" aria-hidden="true"/>

      <div class="pr-field">
        <label for="password-new" class="pr-label">${msg("passwordNew")}</label>
        <div class="pr-password">
          <input
            type="password"
            id="password-new"
            name="password-new"
            class="pr-input"
            autofocus
            autocomplete="new-password"
            aria-describedby="pr-password-hint"
            aria-invalid="<#if messagesPerField.existsError('password','password-confirm')>true</#if>"
          />
          <button type="button" class="pr-password__toggle" data-target="password-new" aria-label="Show password" aria-pressed="false">Show</button>
        </div>
        <#if messagesPerField.existsError('password')>
          <span class="pr-field-error" aria-live="polite">${kcSanitize(messagesPerField.get('password'))?no_esc}</span>
        <#else>
          <span id="pr-password-hint" class="pr-hint">Choose something long and unique: 12 or more characters, such as a short phrase you do not use anywhere else.</span>
        </#if>
      </div>

      <div class="pr-field">
        <label for="password-confirm" class="pr-label">${msg("passwordConfirm")}</label>
        <div class="pr-password">
          <input
            type="password"
            id="password-confirm"
            name="password-confirm"
            class="pr-input"
            autocomplete="new-password"
            aria-describedby="pr-password-match"
            aria-invalid="<#if messagesPerField.existsError('password-confirm')>true</#if>"
          />
          <button type="button" class="pr-password__toggle" data-target="password-confirm" aria-label="Show password" aria-pressed="false">Show</button>
        </div>
        <#if messagesPerField.existsError('password-confirm')>
          <span class="pr-field-error" aria-live="polite">${kcSanitize(messagesPerField.get('password-confirm'))?no_esc}</span>
        </#if>
        <span id="pr-password-match" class="pr-hint pr-match" aria-live="polite"></span>
      </div>

      <label class="pr-check pr-check--block">
        <input type="checkbox" id="logout-sessions" name="logout-sessions" value="on" checked/>
        <span>Sign me out on other devices</span>
      </label>

      <div class="pr-actions">
        <button class="pr-btn" type="submit" id="kc-update-password">Save password</button>
        <#if isAppInitiatedAction??>
          <button class="pr-btn pr-btn--ghost" type="submit" name="cancel-aia" value="true" formnovalidate>${msg("doCancel")}</button>
        </#if>
      </div>
    </form>

    <script>
      (function () {
        document.querySelectorAll('.pr-password__toggle').forEach(function (button) {
          button.addEventListener('click', function () {
            var input = document.getElementById(button.getAttribute('data-target'));
            var show = input.type === 'password';
            input.type = show ? 'text' : 'password';
            button.textContent = show ? 'Hide' : 'Show';
            button.setAttribute('aria-pressed', show ? 'true' : 'false');
            button.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
            input.focus();
          });
        });
        var first = document.getElementById('password-new');
        var second = document.getElementById('password-confirm');
        var note = document.getElementById('pr-password-match');
        function check() {
          if (!second.value) { note.textContent = ''; note.className = 'pr-hint pr-match'; return; }
          var same = first.value === second.value;
          note.textContent = same ? 'Passwords match' : 'Passwords do not match yet';
          note.className = 'pr-hint pr-match ' + (same ? 'pr-match--ok' : 'pr-match--no');
        }
        first.addEventListener('input', check);
        second.addEventListener('input', check);
      })();
    </script>
  </#if>
</@layout.registrationLayout>
