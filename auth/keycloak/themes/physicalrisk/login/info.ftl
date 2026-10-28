<#import "template.ftl" as layout>
<@layout.registrationLayout displayMessage=false; section>
  <#if section = "header">
    <h2 class="pr-title">
      <#if messageHeader??>${kcSanitize(msg("${messageHeader}"))?no_esc}<#else>${message.summary}</#if>
    </h2>
  <#elseif section = "form">
    <div id="kc-info-message" class="pr-info">
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
    </div>
  </#if>
</@layout.registrationLayout>
