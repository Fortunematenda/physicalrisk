<#ftl output_format="plainText">
<#assign actions = requiredActions![]>
<#assign isSetup = actions?seq_contains("VERIFY_EMAIL")>
<#assign isPassword = actions?seq_contains("UPDATE_PASSWORD")>
<#assign firstName = (user.firstName)!"">
PHYSICAL RISK - security matters

Hello<#if firstName?has_content> ${firstName}</#if>,

<#if isSetup>An account has been created for you on the Physical Risk platform. To start, confirm your email address and choose your password:<#elseif isPassword>An administrator has asked you to choose a new password for your Physical Risk account. Your current password keeps working until you do:<#else>An administrator has asked you to update your Physical Risk account:</#if>

${link}

This link expires in ${linkExpirationFormatter(linkExpiration)}.

If you were not expecting this email, you can ignore it and nothing will change.

--
Physical Risk
This is an automated message about your Physical Risk account. Please do not reply to it.
