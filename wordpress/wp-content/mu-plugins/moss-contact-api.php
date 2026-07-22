<?php
/**
 * Plugin Name: Physical Risk MOSS Contact API
 * Description: Connects the existing MetForm contact form to the secure MOSS public API.
 */

if (!defined('ABSPATH')) exit;

add_action('wp_enqueue_scripts', function () {
    if (is_admin()) return;
    $site_key = trim((string) getenv('TURNSTILE_SITE_KEY'));
    $api_url = trim((string) getenv('MOSS_CONTACT_API_URL')) ?: 'https://moss.physicalrisk.com/api/public/contact';
    wp_enqueue_script('cloudflare-turnstile', 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit', [], null, true);
    wp_register_script('moss-contact-api', '', [], null, true);
    wp_enqueue_script('moss-contact-api');
    wp_add_inline_script('moss-contact-api', 'window.MossContact=' . wp_json_encode([
        'apiUrl' => $api_url,
        'siteKey' => $site_key,
        'successMessage' => 'Thank you. Your enquiry has been sent successfully. We will respond within 48 hours.',
    ]) . ';', 'before');
    wp_add_inline_script('moss-contact-api', <<<'JS'
(function () {
  'use strict';
  var submitting = false, captchaToken = '', widgetId = null;
  function field(form, name) { return form.querySelector('[name="mf-' + name + '"]') || form.querySelector('[name="' + name + '"]'); }
  function errorNode(input) {
    var id = 'moss-error-' + (input.name || Math.random().toString(36).slice(2));
    var node = document.getElementById(id);
    if (!node) {
      node = document.createElement('div'); node.id = id; node.className = 'moss-contact-field-error';
      node.setAttribute('role', 'alert'); input.insertAdjacentElement('afterend', node);
      input.setAttribute('aria-describedby', id);
    }
    return node;
  }
  function setError(input, message) {
    if (!input) return; errorNode(input).textContent = message || ''; input.setAttribute('aria-invalid', message ? 'true' : 'false');
  }
  function initForm(form) {
    if (form.dataset.mossContactReady) return;
    if (!field(form, 'full_name') || !field(form, 'organisation') || !field(form, 'email') || !field(form, 'description')) return;
    form.dataset.mossContactReady = '1';
    var programme = field(form, 'program');
    if (programme) { programme.type = 'text'; programme.value = 'MOSS Assessment'; programme.readOnly = true; }
    var website = document.createElement('input'); website.type = 'text'; website.name = 'website'; website.tabIndex = -1;
    website.autocomplete = 'off'; website.setAttribute('aria-hidden', 'true'); website.style.position = 'absolute'; website.style.left = '-10000px'; form.appendChild(website);
    var oldCaptcha = form.querySelector('.mf-recaptcha') || form.querySelector('[class*="recaptcha"]');
    var captchaHost = document.createElement('div'); captchaHost.className = 'moss-turnstile';
    if (oldCaptcha) oldCaptcha.replaceWith(captchaHost); else form.querySelector('button[type="submit"]')?.before(captchaHost);
    var status = document.createElement('div'); status.className = 'moss-contact-status'; status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite'); form.appendChild(status);
    var button = form.querySelector('button[type="submit"], input[type="submit"]');
    var buttonHtml = button && button.tagName === 'BUTTON' ? button.innerHTML : '';
    var buttonValue = button && button.tagName === 'INPUT' ? button.value : 'Send Message';
    function setLoading(loading) {
      submitting = loading;
      if (!button) return;
      button.disabled = loading;
      button.setAttribute('aria-busy', loading ? 'true' : 'false');
      if (button.tagName === 'INPUT') button.value = loading ? 'Sending…' : (buttonValue || 'Send Message');
      else if (loading) button.textContent = 'Sending…';
      else button.innerHTML = buttonHtml || '<span>Send Message</span>';
      if (!loading) {
        button.classList.remove('loading', 'is-loading', 'mf-loading');
        form.classList.remove('loading', 'is-loading', 'mf-loading');
        form.querySelectorAll('.mf-btn-loader, .metform-btn-loader').forEach(function (loader) { loader.remove(); });
      }
    }
    function resetCaptcha(message) {
      captchaToken = '';
      if (window.turnstile && widgetId !== null) window.turnstile.reset(widgetId);
      status.textContent = message || 'Please complete the security check again.';
    }
    function renderCaptcha() {
      if (!window.MossContact.siteKey) { status.textContent = 'The security check is temporarily unavailable.'; if (button) button.disabled = true; return; }
      if (!window.turnstile) return window.setTimeout(renderCaptcha, 100);
      widgetId = window.turnstile.render(captchaHost, {
        sitekey: window.MossContact.siteKey,
        callback: function (t) { captchaToken = t; status.textContent = ''; },
        'expired-callback': function () { resetCaptcha('The security check expired. Please complete it again.'); },
        'error-callback': function () { resetCaptcha('The security check could not be completed. Please try again.'); }
      });
    }
    renderCaptcha();
    form.addEventListener('submit', async function (event) {
      event.preventDefault(); event.stopImmediatePropagation(); if (submitting) return;
      var controls = { fullName: field(form,'full_name'), organisation: field(form,'organisation'), email: field(form,'email'), programmeInterest: programme, description: field(form,'description') };
      Object.keys(controls).forEach(function(k){ setError(controls[k], ''); }); status.textContent = '';
      var payload = { fullName: controls.fullName?.value.trim(), organisation: controls.organisation?.value.trim(), email: controls.email?.value.trim(), programmeInterest: controls.programmeInterest?.value.trim(), description: controls.description?.value.trim(), source: 'wordpress', website: website.value, captchaToken: captchaToken };
      var invalid = false;
      if (!payload.fullName || payload.fullName.length < 2) { setError(controls.fullName, 'Enter your full name.'); invalid = true; }
      if (!payload.organisation || payload.organisation.length < 2) { setError(controls.organisation, 'Enter your organisation.'); invalid = true; }
      if (!controls.email || !controls.email.checkValidity()) { setError(controls.email, 'Enter a valid email address.'); invalid = true; }
      if (!payload.description || payload.description.length < 10) { setError(controls.description, 'Enter at least 10 characters.'); invalid = true; }
      if (!captchaToken) { status.textContent = 'Please complete the security check.'; invalid = true; }
      if (invalid) return;
      setLoading(true);
      var controller = new AbortController();
      var timeoutId = window.setTimeout(function () { controller.abort(); }, 30000);
      try {
        var response = await fetch(window.MossContact.apiUrl, { method: 'POST', mode: 'cors', credentials: 'omit', headers: {'Content-Type':'application/json'}, body: JSON.stringify(payload), signal: controller.signal });
        var data = await response.json().catch(function(){ return {}; });
        if (!response.ok) {
          var captchaError = data && data.message && typeof data.message === 'object' && data.message.captchaToken;
          if (captchaError) {
            resetCaptcha(typeof captchaError === 'string' ? captchaError : 'Security verification failed. Please complete it again.');
            return;
          }
          var apiMessage = data && typeof data.message === 'string' ? data.message : 'We could not send your enquiry. Please try again.';
          throw new Error(apiMessage);
        }
        form.reset(); if (programme) programme.value = 'MOSS Assessment'; captchaToken = ''; if (window.turnstile && widgetId !== null) window.turnstile.reset(widgetId);
        status.textContent = window.MossContact.successMessage;
      } catch (error) {
        status.textContent = error && error.name === 'AbortError'
          ? 'The request timed out after 30 seconds. Your details have been kept; please try again.'
          : (error && typeof error.message === 'string' ? error.message : 'A network error prevented submission. Your details have been kept; please try again.');
      } finally {
        window.clearTimeout(timeoutId);
        setLoading(false);
      }
    }, true);
  }
  function scan() { document.querySelectorAll('form').forEach(initForm); }
  document.addEventListener('DOMContentLoaded', scan); new MutationObserver(scan).observe(document.documentElement, {childList:true,subtree:true});
})();
JS
    );
    wp_add_inline_style('wp-block-library', '.moss-contact-field-error{color:#b42318;font-size:13px;margin-top:6px}.moss-contact-status{margin-top:14px}.moss-turnstile{margin:14px 0}');
});
