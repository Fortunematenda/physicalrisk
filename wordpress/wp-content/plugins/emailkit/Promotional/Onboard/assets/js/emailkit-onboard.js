/******/ (function() { // webpackBootstrap
var __webpack_exports__ = {};
jQuery(document).ready(function ($) {
  "use strict";

  function EkitAdminonHashChange() {
    var hash = window.location.hash;
    if (hash) {
      // using ES6 template string syntax
      $("".concat(hash, "-tab")).trigger('click');
    }
  }

  // admin dashboard accordion
  $('.emailkit-admin-single-accordion').on('click', '.emailkit-admin-single-accordion--heading', function () {
    $(this).next().slideToggle().parent().toggleClass('active').siblings().removeClass('active').find('.emailkit-admin-single-accordion--body').slideUp();
  });
  $('.emailkit-admin-single-accordion:first-child .emailkit-admin-single-accordion--heading').trigger('click');

  // video popup
  $('.emailkit-admin-video-tutorial-item, .emailkit-onboard-tutorial--btn').on('click', 'a', function (e) {
    var video_id = $(this).data('video_id');
    if (video_id) {
      e.preventDefault();
      $('.emailkit-admin-video-tutorial-popup').toggleClass('show').find('.emailkit-admin-video-tutorial-iframe').html('<iframe width="700" height="400" src="https://www.youtube.com/embed/' + video_id + '?autoplay=1" frameborder="0" allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>');
    }
  });
  $('.emailkit-admin-video-tutorial-close').on('click', function () {
    $(this).parents('.emailkit-admin-video-tutorial-popup').removeClass('show').find('.emailkit-admin-video-tutorial-iframe').html('');
  });

  // Adding class prev and next elements
  $('.emailkit-admin-nav-link[data-attr-toggle]').on('click', function () {
    var $el = $(this),
      hashId = this.hash;
    $el.parents('.attr-nav-tabs').find('a').removeClass('top').removeClass('bottom');
    $el.parents('li').prev().find('a').addClass('top');
    $el.parents('li').next().find('a').addClass('bottom');

    // Set Current Tab Hash to URL Bar.
    history.pushState(null, null, hashId);
  });
  EkitAdminonHashChange();
  if ($('#v-elementskit-tabContent').length > 0) {
    var stickyOffset = $('#v-elementskit-tabContent').offset().top;
    $(window).scroll(function () {
      var sticky = $('.emailkit-admin-section-header'),
        scroll = $(window).scrollTop();
      if (scroll >= stickyOffset) {
        sticky.addClass('fixed').css({
          'width': jQuery('#v-elementskit-tabContent').width()
        });
      } else {
        sticky.removeClass('fixed').css({
          'width': 'auto'
        });
      }
      ;
    });
  }
  $('#emailkit-admin-settings-form').on('submit', function (e) {
    var form = $(this);
    var btn = form.find('.emailkit-admin-settings-form-submit');
    var formdata = form.serialize();
    form.addClass('is-loading');
    btn.attr("disabled", true);
    btn.find('.emailkit-admin-save-icon').hide();
    formdata += '&nonce=' + mf_ajax_var.nonce;
    $.post(ajaxurl + '?action=emailkit_admin_action', formdata, function (data) {
      form.removeClass('is-loading');
      btn.removeAttr("disabled");
      btn.find('.emailkit-admin-save-icon').fadeIn();
      show_header_footer_menu();
      show_widget_builder_menu();

      // Multistep - redirect to settings page after save
      if (btn.hasClass('emailkit-onboard-btn')) {
        window.location.href = window.mf_ajax_var.plugin_redirect_url;
      }
    });
    e.preventDefault();
  });
  $('#emailkit-admin-license-form').on('submit', function (e) {
    var form = $(this);
    var btn = form.find('.emailkit-admin-license-form-submit');
    var formdata = form.serialize();
    var result = form.find('.elementskit-license-form-result .attr-alert');
    form.addClass('is-loading');
    btn.find('.emailkit-admin-save-icon').hide();
    formdata += '&nonce=' + mf_ajax_var.nonce;
    $.post(ajaxurl + '?action=mf_admin_license', formdata, function (data) {
      form.removeClass('is-loading');
      btn.removeAttr("disabled");
      btn.find('.emailkit-admin-save-icon').fadeIn();
      result.attr('class', 'attr-alert attr-alert-' + data.status).html(data.message);
      if (data.validate == 1) {
        setTimeout(function () {
          window.location.reload();
        }, 2000);
      }
    }, 'json');
    e.preventDefault();
  });

  // only for header footer module
  function show_header_footer_menu() {
    var checked = $('#emailkit-admin-switch__module__list____header-footer').prop('checked');
    var menu_html = $('#elementskit-template-admin-menu').html();
    var menu_parent = $('#toplevel_page_elementskit .wp-submenu');
    var menu_item = menu_parent.find('a[href="edit.php?post_type=elementskit_template"]');
    if (checked == true) {
      if (menu_item.length > 0 || menu_parent.attr('item-added') == 'y') {
        menu_item.parent().show();
      } else {
        menu_parent.find('li.wp-first-item').after(menu_html);
        menu_parent.attr('item-added', 'y');
      }
    } else {
      menu_item.parent().hide();
    }
  }
  ;

  // only for widget builder module
  function show_widget_builder_menu() {
    var checked = $('#emailkit-admin-switch__module__list____widget-builder').prop('checked');
    var menu_html = $('#elementskit-template-widget-menu').html();
    var menu_parent = $('#toplevel_page_elementskit .wp-submenu');
    var menu_item = menu_parent.find('a[href="edit.php?post_type=elementskit_widget"]');
    if (checked == true) {
      if (menu_item.length > 0 || menu_parent.attr('item-added') == 'y') {
        menu_item.parent().show();
      } else {
        menu_parent.find('li.wp-first-item').next().after(menu_html);
        menu_parent.attr('item-added', 'y');
      }
    } else {
      menu_item.parent().hide();
    }
  }
  ;

  // zoom check connection
  $('.emailkit-zoom-connection').on('click', function (e) {
    e.preventDefault();
    var $el = $(this);
    $el.attr('disabled', true);
    jQuery.ajax({
      data: {},
      type: 'post',
      url: window.rest_config.rest_url + 'elementskit/v1/zoom-meeting/hosts/',
      beforeSend: function beforeSend(xhr) {
        xhr.setRequestHeader('X-WP-Nonce', window.rest_config.nonce);
      },
      success: function success(response) {
        alert(response.message);
        $el.attr('disabled', false);
      }
    });
  });

  /**
   * Remove cache and regenerate cache from api
   * and store it and also show the latest feed.
   */
  $('#mf_instagram_refresh_feed_btn').on('click', function (event) {
    event.preventDefault();
    var endpoint = elementskit.resturl + 'widget/instagram-feed/refresh_feed';
    var username = $('#emailkit-admin-option-textuser__data__instragram____username__').val();
    $.get("https://www.instagram.com/" + username + "/?__a=1", function (content) {
      $.ajax({
        type: 'POST',
        url: endpoint,
        data: {
          content: content
        },
        success: function success(data) {
          alert('Instagram data refreshed');
        },
        error: function error(data) {
          alert('Instagram data refreshed');
        }
      });
    });
  });

  /**
   * Removes the transient key
   *
   */
  $('.cache_clean_social_provider').on('click', function (event) {
    event.preventDefault();
    var self = $(this);
    var provider = self.data('provider');
    var uri = self.data('url_part');
    var endpoint = elementskit.resturl + 'widget/' + uri + '/remove_cache';
    self.attr('disabled', true);
    $.ajax({
      type: 'POST',
      url: endpoint,
      data: {
        'provider_id': provider
      },
      success: function success(data) {
        self.attr('disabled', false);
        alert(data.msg);
      },
      error: function error(data) {
        self.attr('disabled', true);
        alert('Something wrong.....');
      }
    });
  });
  function popup_window(url, width, height, cb) {
    var top = top || screen.height / 2 - height / 2,
      left = left || screen.width / 2 - width / 2,
      win = window.open(url, '', 'location=1,status=1,resizable=yes,width=' + width + ',height=' + height + ',top=' + top + ',left=' + left);
    function check_window() {
      if (!win || win.closed != false) {
        if (cb) cb();
      } else {
        setTimeout(check_window, 100);
      }
    }
    setTimeout(check_window, 100);
  }

  // Widget All Toggle button Script
  function checkAllAdminToggle(el) {
    var parent = el.closest('.attr-tab-pane');
    var fields = $(parent).find('.emailkit-admin-fields-container-fieldset');
    var value = fields.find('.emailkit-admin-control-input:checked').length == fields.find('.emailkit-admin-control-input:not(:disabled)').length;
    $(parent).find('.emailkit-all-control-input').prop("checked", value);
  }

  /*
      -> show or hide input fields wrapper div
  */
  function toggleInputField(target, act) {
    var input_ele_uid = target.getAttribute('aria-controls');
    var wrapper = document.getElementById("".concat(input_ele_uid));
    if (act) {
      $(wrapper).removeClass('attr-in');
      wrapper.style.height = '0px';
      target.style.pointerEvents = 'none';
    } else {
      wrapper.style.height = 'auto';
      target.style.pointerEvents = 'auto';
      //enable first user data control
      if (input_ele_uid === 'mail_chimp_data_control') {
        $(wrapper).addClass('attr-in');
      }
    }
  }

  /*
      -------------------------
       disable label handler
      -------------------------
  */
  function disableLabelHandler(element) {
    //get the unique name of each widget controler
    var uid = element.value;
    var user_data_element = $(".label-".concat(uid));
    // disable_place contains input fields like app id/secret
    var disable_place = user_data_element.find('.attr-btn');

    //when widget control is enabled remove "disable" text
    if ($(element).prop('checked')) {
      user_data_element.removeClass('widget-disabled');
      //when widget control is disabled add "disable" text
    } else {
      user_data_element.addClass('widget-disabled');
    }

    //inset disable markup when the widget control is disabled
    var disable_markup = document.createElement('small');
    disable_markup.setAttribute('class', "attr-widget-activate-text");
    disable_markup.setAttribute('id', "disable-msg-".concat(uid));
    disable_markup.textContent = 'Disabled';
    if (user_data_element.hasClass('widget-disabled')) {
      if (disable_place.hasClass('attr-btn')) {
        //when pro plugin is not actiavted remove "disable" text
        if (!user_data_element.hasClass('pro-disabled')) {
          disable_place[0].setAttribute('aria-expanded', false);
          disable_place[0].appendChild(disable_markup);
        }
        toggleInputField(disable_place[0], true);
      }
    }
    //remove "disable" text when widget control is activated
    else {
      if (disable_place.hasClass('attr-btn')) {
        //enable first user data control
        if (uid === 'mail-chimp') {
          disable_place[0].setAttribute('aria-expanded', true);
        }
        var labelNode = document.getElementById("disable-msg-".concat(uid));
        if (labelNode) {
          var parentNode = labelNode.parentNode;
          parentNode.removeChild(labelNode);
        }
        toggleInputField(disable_place[0], false);
      }
    }
  }

  /*
      -> loop through all the widget toggle control 
  */
  document.querySelectorAll('.emailkit-admin-control-input').forEach(function (widgets_controls) {
    disableLabelHandler(widgets_controls);
  });
  $('.emailkit-all-control-input').each(function (index, element) {
    checkAllAdminToggle(element);
  });
  $('.emailkit-admin-fields-container-fieldset .emailkit-admin-control-input').on('change', function (element) {
    checkAllAdminToggle(element.target);
    disableLabelHandler(element.target);
  });
  $('.emailkit-all-control-input').on('change', function (element) {
    var wrapper = $(element.target).closest('.attr-tab-pane').find('.emailkit-admin-fields-container')[0];
    var toggle_controls = $(wrapper).find('.emailkit-admin-control-input:not(:disabled)');
    toggle_controls.each(function (index, control) {
      $(control).prop("checked", element.target.checked);
      disableLabelHandler(control);
    });
  });

  // onboard email validation
  function onboard_signup_validation(el) {
    var signup_form = el;
    $('.error').remove();
    if (signup_form.length && !ValidateEmail(signup_form.val())) {
      signup_form.parent().after('<p class="error">Please enter valid email.</p>');
      return false;
    }
    return true;
  }

  // validating onboard signup input by onInput
  $('.emailkit-onboard-step-wrapper #signup').on('input', function () {
    onboard_signup_validation($(this));
  });

  // preventing form submit when press enter
  $('.emailkit-onboard-step-wrapper #signup').on("keydown", function (event) {
    if (event.key == "Enter") {
      event.preventDefault();
    }
  });

  // onboard navigation
  $('.emailkit-onboard-nav-item').on('click', function () {
    if ($(this).index() > 1 && !$(this).hasClass('next') && !$(this).hasClass('selected')) {
      return false;
    }

    // validate email
    if ($(this).hasClass('next')) {
      var signup_form = $('.emailkit-onboard-step-wrapper.active #signup');

      // if(!onboard_signup_validation(signup_form)) { return false; }
    }
    // ./end validate email

    $(this).next().addClass('next').siblings().removeClass('next');
    $(this).removeClass('selected');
    $(this).addClass('active').siblings().removeClass('active');
    $(this).prevAll().addClass('selected').end().nextAll().removeClass('selected');
    var step_key = $(this).data('step_key'),
      nav = $(this).parents('.emailkit-onboard-nav'),
      offsetWrapper = nav.offset().left,
      progressWidth = $(this).hasClass('last') ? nav.width() : $(this).offset().left - offsetWrapper + $(this).outerWidth();
    $('.emailkit-onboard-progressbar').css('width', progressWidth);
    $('.emailkit-onboard-' + step_key).addClass('active').siblings().removeClass('active');
  });
  $('.emailkit-onboard-nav-item:first-of-type').trigger('click');
  function ValidateEmail(maildId) {
    return /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)*$/.test(maildId);
  }

  // onboard pagination
  $('.emailkit-onboard-pagi-btn').on('click', function (e) {
    if ($(this).hasClass('next')) {
      $('.emailkit-onboard-nav-item.active').next().trigger('click');
    }
    if ($(this).hasClass('prev')) {
      $('.emailkit-onboard-nav-item.active').prev().trigger('click');
    }
  });

  // onboard filter widget and moduel
  var basic_widgets_moduels = ['elementskit-icon-pack', 'header-footer', 'megamenu', 'button', 'heading', 'category-list', 'post-list', 'page-list', 'nav-menu', 'accordion', 'header-info', 'header-search', 'icon-box', 'image-box', 'client-logo', 'faq', 'funfact', 'testimonial', 'social', 'video', 'blog-posts', 'pricing', 'team', 'tab', 'header-offcanvas'];
  var exclude_widget_ad = ['ninja-forms', 'wp-forms', 'we-forms', 'social-share', 'drop-caps', 'caldera-forms', 'onepage-scroll', 'contact-form7', 'fluent-forms'];
  $('.emailkit-admin-input-radio .emailkit-admin-control-input').on('change', function (e, param) {
    var inputWrapper = $('.emailkit-onboard-section .attr-input:not(.emailkit-content-type-pro-disabled)'),
      input = inputWrapper.find('.emailkit-admin-control-input');
    $('.emailkit-admin-input-radio .emailkit-admin-input-switch').removeClass('active');
    $(this).parent().addClass('active');
    if (param && param === 'hold') {
      return false;
    }
    input.prop('checked', false);
    if ($(this).val() == 'basic') {
      basic_widgets_moduels.forEach(function (value) {
        inputWrapper.find('.emailkit-admin-control-input[value="' + value + '"]').prop('checked', true);
      });
    } else if ($(this).val() == 'advanced') {
      input.each(function () {
        if (exclude_widget_ad.indexOf($(this).val()) == -1) {
          $(this).prop('checked', true);
        } else {
          $(this).prop('checked', false);
        }
      });
    } else {
      input.prop('checked', true);
    }
  });
  jQuery('.emailkit-admin-input-radio .emailkit-admin-control-input:checked').trigger('change');

  // widget or module on change to trigger 'custom' fitler
  $('.emailkit-onboard-section .emailkit-admin-control-input').on('change', function () {
    var filterNav = $('.emailkit-admin-input-radio .emailkit-admin-control-input');
    if (filterNav.val() != 'custom') {
      $('.emailkit-onboard-custom-filter .emailkit-admin-control-input').prop('checked', true);
      $('.emailkit-onboard-custom-filter .emailkit-admin-control-input').trigger('change', 'hold');
    }
  });

  // installing plugin
  function mf_install_active_plugin(ajaxurl, success_callback, beforeText, successText) {
    var _this = this;
    $.ajax({
      type: "GET",
      url: ajaxurl,
      beforeSend: function beforeSend() {
        $(_this).addClass('emailkit-plugin-install-activate');
        if (beforeText) {
          $(_this).html(beforeText);
        }
      },
      success: function success(response) {
        $(_this).removeClass('emailkit-plugin-install-activate');
        if (ajaxurl.indexOf('action=activate') >= 0) {
          $(_this).addClass('activated');
        }
        $(_this).html(successText);
        if (success_callback) {
          success_callback();
        }
      }
    });
  }
  $('.emailkit-onboard-single-plugin--install_plugin').on('click', function (e) {
    var _this2 = this;
    e.preventDefault();
    var installation_url = $(this).attr('href'),
      activation_url = $(this).attr('data-activation_url'),
      plugin_status = $(this).data('plugin_status');
    if ($(this).hasClass('emailkit-plugin-install-activate') || $(this).hasClass('activated')) {
      return false;
    }
    if (plugin_status == 'not_installed') {
      mf_install_active_plugin.call(this, installation_url, function () {
        mf_install_active_plugin.call(_this2, activation_url, null, 'Activating...', 'Activated');
      }, 'Installing...', 'Installed');
    } else if (plugin_status == 'installed') {
      mf_install_active_plugin.call(this, activation_url, null, 'Activating...', 'Activated');
    }
  });
  jQuery('.emailkit-onboard-tut-term--help').on('click', function () {
    $(this).toggleClass('active').prev().toggleClass('active');
  });
}); // end ready function
/******/ })()
;