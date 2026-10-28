<#import "template.ftl" as layout>
<#assign pendingSteps = requiredActions?? && actionUri?has_content && !skipLink??>
<#assign accountReady = !pendingSteps && message?has_content
  && (message.summary == msg("accountUpdatedMessage") || message.summary == msg("emailVerifiedMessage"))>
<@layout.registrationLayout displayMessage=false; section>
  <#if section = "header">
    <h2 class="pr-title">
      <#if pendingSteps>Set up your account<#elseif accountReady>You are all set<#elseif messageHeader??>${kcSanitize(msg("${messageHeader}"))?no_esc}<#else>${message.summary}</#if>
    </h2>
    <#if pendingSteps>
      <p class="pr-subtitle">A few quick steps and you are ready to sign in.</p>
    </#if>
  <#elseif section = "form">
    <div id="kc-info-message" class="pr-info">
      <#if pendingSteps>
        <ol class="pr-steps">
          <#list requiredActions as reqActionItem>
            <li>${kcSanitize(msg("prRequiredAction.${reqActionItem}"))?no_esc}</li>
          </#list>
        </ol>
        <a class="pr-btn pr-btn--block" href="${actionUri}">Continue</a>
      <#elseif accountReady>
        <p class="pr-info__text">
          Your account is ready. Sign in with your email address and new password.
          <span id="pr-redirect-note">Taking you to the sign-in page…</span>
        </p>
        <a class="pr-btn pr-btn--block" id="pr-sign-in" href="https://apps.physicalrisk.com/">Sign in now</a>
        <script>
          (function () {
            var link = document.getElementById('pr-sign-in');
            var host = location.hostname;
            if (/^auth\./.test(host)) {
              link.href = location.protocol + '//' + host.replace(/^auth\./, 'apps.') + '/';
            }
            setTimeout(function () { location.replace(link.href); }, 4000);
          })();
        </script>
      <#else>
        <p class="pr-info__text">
          ${message.summary}<#if requiredActions??><#list requiredActions>: <strong><#items as reqActionItem>${kcSanitize(msg("requiredAction.${reqActionItem}"))?no_esc}<#sep>, </#items></strong></#list></#if>
        </p>
        <#if !skipLink??>
          <#if pageRedirectUri?has_content>
            <a class="pr-btn pr-btn--block" href="${pageRedirectUri}">${kcSanitize(msg("backToApplication"))?no_esc}</a>
          <#elseif actionUri?has_content>
            <a class="pr-btn pr-btn--block" href="${actionUri}">${kcSanitize(msg("proceedWithAction"))?no_esc}</a>
          <#elseif (client.baseUrl)?has_content>
            <a class="pr-btn pr-btn--block" href="${client.baseUrl}">${kcSanitize(msg("backToApplication"))?no_esc}</a>
          </#if>
        </#if>
      </#if>
    </div>
  </#if>
</@layout.registrationLayout>
