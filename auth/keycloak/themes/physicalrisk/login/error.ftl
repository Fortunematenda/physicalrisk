<#import "template.ftl" as layout>
<@layout.registrationLayout displayMessage=false; section>
  <#if section = "header">
    <h2 class="pr-title">Something went wrong</h2>
    <p class="pr-subtitle">We could not complete that sign-in request.</p>
  <#elseif section = "form">
    <div class="pr-alert pr-alert--error" role="alert">
      <#if message?has_content>
        ${kcSanitize(message.summary)?no_esc}
      <#else>
        An unexpected error occurred. Return to the portal and try again.
      </#if>
    </div>
    <p style="margin-top:1.25rem;text-align:center;">
      <a class="pr-link" href="${client.baseUrl!''}">Back to application</a>
    </p>
  </#if>
</@layout.registrationLayout>
