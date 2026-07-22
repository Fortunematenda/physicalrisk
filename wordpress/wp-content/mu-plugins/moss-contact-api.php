<?php
/**
 * Plugin Name: Physical Risk MOSS Contact API
 * Description: Connects the existing MetForm contact form to the secure MOSS public API.
 */

if (!defined('ABSPATH')) exit;

add_action('wp_enqueue_scripts', function () {
    if (is_admin()) return;
    $asset_version = '20260722.3';
    $site_key = trim((string) getenv('TURNSTILE_SITE_KEY'));
    $api_url = trim((string) getenv('MOSS_CONTACT_API_URL')) ?: 'https://moss.physicalrisk.com/api/public/contact';
    wp_enqueue_script('cloudflare-turnstile', 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit', [], null, true);
    wp_enqueue_style('moss-contact-api', plugin_dir_url(__FILE__) . 'assets/moss-contact-api.css', [], $asset_version);
    wp_enqueue_script('moss-contact-api', plugin_dir_url(__FILE__) . 'assets/moss-contact-api.js', [], $asset_version, true);
    wp_add_inline_script('moss-contact-api', 'window.MossContact=' . wp_json_encode([
        'apiUrl' => $api_url,
        'siteKey' => $site_key,
        'successMessage' => 'Thank you. Your enquiry has been sent successfully. We will respond within 48 hours.',
    ]) . ';', 'before');
    wp_add_inline_script('moss-contact-api', <<<'JS'
(function () {
  'use strict';
  function field(form, name) { return form.querySelector('[name="mf-' + name + '"]') || form.querySelector('[name="' + name + '"]'); }
  function errorNode(input) {
    var id = 'moss-error-' + (input.name || Math.random().toString(36).slice(2));
    var node = document.getElementById(id);
    if (!node) {
      node = document.createElement('div'); node.id = id; node.className = 'moss-contact-field-error';
      node.setAttribute('role', 'alert');
      var helper = input.parentElement && input.parentElement.querySelector('.moss-description-helper');
      (helper || input).insertAdjacentElement('afterend', node);
      var describedBy = (input.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean);
      if (describedBy.indexOf(id) === -1) describedBy.push(id);
      input.setAttribute('aria-describedby', describedBy.join(' '));
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
    form.classList.add('moss-contact-form');
    var submitting = false, captchaToken = '', widgetId = null;
    var description = field(form, 'description');
    description.setAttribute('minlength', '10');
    description.setAttribute('maxlength', '3000');
    var helper = document.createElement('div');
    var helperId = 'moss-description-helper-' + Math.random().toString(36).slice(2);
    helper.id = helperId; helper.className = 'moss-description-helper';
    var counter = document.createElement('span'); counter.className = 'moss-description-counter';
    var minimum = document.createElement('span'); minimum.className = 'moss-description-minimum';
    minimum.textContent = 'At least 10 characters required.';
    helper.appendChild(counter); helper.appendChild(minimum); description.insertAdjacentElement('afterend', helper);
    var describedBy = (description.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean);
    if (describedBy.indexOf(helperId) === -1) describedBy.push(helperId);
    description.setAttribute('aria-describedby', describedBy.join(' '));
    function updateDescriptionHelper() {
      var meaningfulLength = description.value.trim().length;
      counter.textContent = meaningfulLength.toLocaleString('en-US') + ' / 3,000 characters';
      minimum.hidden = meaningfulLength >= 10;
    }
    description.addEventListener('input', updateDescriptionHelper);
    updateDescriptionHelper();
    var programme = field(form, 'program');
    if (programme) { programme.type = 'text'; programme.value = 'MOSS Assessment'; programme.readOnly = true; }
    var website = document.createElement('input'); website.type = 'text'; website.name = 'website'; website.tabIndex = -1;
    website.autocomplete = 'off'; website.setAttribute('aria-hidden', 'true'); website.style.position = 'absolute'; website.style.left = '-10000px'; form.appendChild(website);
    var oldCaptcha = form.querySelector('.mf-recaptcha') || form.querySelector('[class*="recaptcha"]');
    var captchaHost = document.createElement('div'); captchaHost.className = 'moss-turnstile';
    if (oldCaptcha) oldCaptcha.replaceWith(captchaHost); else form.querySelector('button[type="submit"]')?.before(captchaHost);
    var button = form.querySelector('button[type="submit"], input[type="submit"]');
    var status = document.createElement('div'); status.className = 'moss-contact-status'; status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite'); status.setAttribute('tabindex', '-1');
    if (button) button.insertAdjacentElement('beforebegin', status); else form.appendChild(status);
    var buttonHtml = button && button.tagName === 'BUTTON' ? button.innerHTML : '';
    var buttonValue = button && button.tagName === 'INPUT' ? button.value : 'Send Message';
    // MetForm/Elementor can leave a legacy inline response block in the form.
    // Remove every such block before creating our single body-level dialog.
    document.querySelectorAll('body *').forEach(function (node) {
      if (node.closest('.moss-success-overlay')) return;
      if (node.children.length === 0 && /enquiry submitted/i.test(node.textContent || '')) {
        var legacy = node.closest('.mf-response-msg, .metform-response-message, .elementor-message, .moss-success-modal, [class*="success"]') || node;
        if (legacy && !legacy.closest('.moss-success-overlay')) legacy.remove();
      }
    });
    document.querySelectorAll('.moss-success-modal, .moss-success-overlay').forEach(function (oldModal) { oldModal.remove(); });
    var modal = document.createElement('div');
    modal.className = 'moss-success-overlay';
    modal.hidden = true;
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-labelledby', 'moss-success-title');
    modal.innerHTML = '<div class="moss-success-dialog" tabindex="-1">' +
        '<div class="moss-success-icon" aria-hidden="true">&#10003;</div>' +
        '<h2 id="moss-success-title">Enquiry submitted</h2>' +
        '<p>Thank you! Your enquiry has been submitted successfully. We will respond within 48 hours.</p>' +
        '<button type="button" class="moss-success-close">Close</button>' +
      '</div>';
    document.body.appendChild(modal);
    var modalDialog = modal.querySelector('.moss-success-dialog');
    var modalClose = modal.querySelector('.moss-success-close');
    var modalTimer = null;
    function closeSuccessModal() {
      if (!modal.classList.contains('is-visible')) return;
      window.clearTimeout(modalTimer); modalTimer = null;
      modal.classList.remove('is-visible');
      modal.hidden = true;
      document.body.classList.remove('moss-modal-open');
      if (button && document.contains(button)) button.focus({ preventScroll: true });
    }
    function showSuccessModal() {
      modal.hidden = false;
      modal.classList.add('is-visible');
      document.body.classList.add('moss-modal-open');
      modalDialog.focus({ preventScroll: true });
      modalTimer = window.setTimeout(closeSuccessModal, 8000);
    }
    modalClose.addEventListener('click', closeSuccessModal);
    modal.addEventListener('click', function (event) { if (event.target === modal) closeSuccessModal(); });
    modal.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') { event.preventDefault(); closeSuccessModal(); }
      if (event.key === 'Tab') { event.preventDefault(); modalClose.focus(); }
    });
    function setStatus(type, message, bringIntoView) {
      status.className = 'moss-contact-status' + (type ? ' moss-contact-status--' + type : '');
      status.textContent = message || '';
      if (message && bringIntoView && window.matchMedia('(max-width: 767px)').matches) {
        status.focus({ preventScroll: true });
        status.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
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
      setStatus('error', message || 'Please complete the security check again.', true);
    }
    function renderCaptcha() {
      if (!window.MossContact.siteKey) { setStatus('error', 'The security check is temporarily unavailable.', false); if (button) button.disabled = true; return; }
      if (!window.turnstile) return window.setTimeout(renderCaptcha, 100);
      widgetId = window.turnstile.render(captchaHost, {
        sitekey: window.MossContact.siteKey,
        callback: function (t) { captchaToken = t; if (!submitting) setStatus('', '', false); },
        'expired-callback': function () { resetCaptcha('The security check expired. Please complete it again.'); },
        'error-callback': function () { resetCaptcha('The security check could not be completed. Please try again.'); }
      });
    }
    renderCaptcha();
    form.addEventListener('submit', async function (event) {
      event.preventDefault(); event.stopImmediatePropagation(); if (submitting) return;
      var controls = { fullName: field(form,'full_name'), organisation: field(form,'organisation'), email: field(form,'email'), programmeInterest: programme, description: description };
      Object.keys(controls).forEach(function(k){ setError(controls[k], ''); }); setStatus('', '', false);
      var payload = { fullName: controls.fullName?.value.trim(), organisation: controls.organisation?.value.trim(), email: controls.email?.value.trim(), programmeInterest: controls.programmeInterest?.value.trim(), description: controls.description?.value.trim(), source: 'wordpress', website: website.value, captchaToken: captchaToken };
      var invalid = false;
      if (!payload.fullName || payload.fullName.length < 2) { setError(controls.fullName, 'Enter your full name.'); invalid = true; }
      if (!payload.organisation || payload.organisation.length < 2) { setError(controls.organisation, 'Enter your organisation.'); invalid = true; }
      if (!controls.email || !controls.email.checkValidity()) { setError(controls.email, 'Enter a valid email address.'); invalid = true; }
      if (!payload.description || payload.description.length < 10) { setError(controls.description, 'At least 10 characters required.'); invalid = true; }
      if (payload.description && payload.description.length > 3000) { setError(controls.description, 'Enter no more than 3,000 characters.'); invalid = true; }
      if (!captchaToken) { setStatus('error', 'Please complete the security check.', true); invalid = true; }
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
            resetCaptcha('Security verification failed. Please complete it again.');
            return;
          }
          var safeMessage = data && typeof data.message === 'string' ? data.message : 'We could not send your enquiry. Your details have been kept; please try again.';
          var apiError = new Error(safeMessage); apiError.consumedToken = true; throw apiError;
        }
        if (!data || data.success !== true) throw new Error('UNCONFIRMED_SUBMISSION');
        form.reset();
        form.querySelectorAll('select').forEach(function (select) { select.selectedIndex = 0; });
        if (programme) programme.value = 'MOSS Assessment';
        updateDescriptionHelper(); captchaToken = '';
        if (window.turnstile && widgetId !== null) window.turnstile.reset(widgetId);
        form.querySelectorAll('.mf-response-msg, .metform-response-message, .elementor-message').forEach(function (node) { node.textContent = ''; node.hidden = true; });
        setStatus('', '', false);
        showSuccessModal();
      } catch (error) {
        captchaToken = '';
        if (window.turnstile && widgetId !== null) window.turnstile.reset(widgetId);
        setStatus('error', error && error.name === 'AbortError'
          ? 'The request timed out after 30 seconds. Your details have been kept; please try again.'
          : (error && error.message && !/^SUBMISSION_|^UNCONFIRMED_/.test(error.message)
              ? error.message
              : 'We could not send your enquiry. Your details have been kept; please try again.'), true);
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
});
