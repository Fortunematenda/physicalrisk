<#macro registrationLayout bodyClass="" displayInfo=false displayMessage=true displayRequiredFields=false>
<!DOCTYPE html>
<html class="pr-html" <#if realm.internationalizationEnabled>lang="${locale.currentLanguageTag}"<#else>lang="en"</#if>>
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <meta name="robots" content="noindex, nofollow"/>
  <title>${msg("loginTitle",(realm.displayName!''))?no_esc}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com"/>
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin/>
  <link href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700;1,9..40,400&family=Instrument+Serif:ital@0;1&display=swap" rel="stylesheet"/>
  <#if properties.styles?has_content>
    <#list properties.styles?split(' ') as style>
      <link href="${url.resourcesPath}/${style}" rel="stylesheet"/>
    </#list>
  </#if>
  <#if properties.scripts?has_content>
    <#list properties.scripts?split(' ') as script>
      <script src="${url.resourcesPath}/${script}" type="text/javascript"></script>
    </#list>
  </#if>
</head>
<body class="pr-body ${bodyClass}">
  <div class="pr-shell">
    <aside class="pr-hero" aria-hidden="true">
      <div class="pr-hero__glow pr-hero__glow--a"></div>
      <div class="pr-hero__glow pr-hero__glow--b"></div>
      <div class="pr-hero__grid"></div>
      <div class="pr-hero__content">
        <img
          class="pr-hero__logo"
          src="${url.resourcesPath}/img/physical_risk_logo_main.png"
          alt="Physical Risk"
        />
        <h1 class="pr-hero__title">Secure access to Physical Risk Platform</h1>
        <p class="pr-hero__lede">One sign-in for the portal, MOSS, and the enterprise repository.</p>
      </div>
    </aside>

    <main class="pr-panel">
      <div class="pr-panel__inner">
        <header class="pr-panel__brand">
          <img
            class="pr-panel__logo"
            src="${url.resourcesPath}/img/physical_risk_logo_main.png"
            alt="Physical Risk"
          />
        </header>

        <div class="pr-panel__heading">
          <#nested "header">
        </div>

        <#if displayMessage && message?has_content && (message.type != 'warning' || !isAppInitiatedAction??)>
          <div class="pr-alert pr-alert--${message.type}" role="alert">
            <span>${kcSanitize(message.summary)?no_esc}</span>
          </div>
        </#if>

        <div class="pr-panel__form">
          <#nested "form">
        </div>

        <#if displayInfo>
          <div class="pr-panel__info">
            <#nested "info">
          </div>
        </#if>

        <footer class="pr-panel__footer">
          <span>Physical Risk Consultancy</span>
          <span class="pr-dot" aria-hidden="true"></span>
          <span>SSO</span>
        </footer>
      </div>
    </main>
  </div>
</body>
</html>
</#macro>
