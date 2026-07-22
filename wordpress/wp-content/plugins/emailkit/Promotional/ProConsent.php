<?php 
namespace EmailKit\Promotional;
defined('ABSPATH') || exit;
class ProConsent{
  public function get_consent_form(){
    // Check if EmailKit Pro is active (replace with your actual check)
    $is_pro_active = is_plugin_active('emailkit-pro/emailkit-pro.php');
    $buy_pro_url = 'https://wpmet.com/plugin/emailkit/pricing/'; 
    $show_pro_badge = !$is_pro_active;
    ?>
        <style>
        .emailkit-user-consent-for-banner{
            margin: 0 0 15px 0!important;
            width: 842px;
            max-width: 1350px;
        }
        .emailkit-success-notice {
            position: fixed;
            top: 50px;
            right: 20px;
            background-color: #14c87c;
            color: white;
            padding: 10px;
            border-radius: 5px;
            display: none;
        }
        .emailkit-copy-paste-section {
            margin-top: 20px;
            padding: 15px 20px;
            background: #fff;
            border: 1px solid #e4e7ef;
            border-radius: 10px;
            max-width: 350px;
            min-width: 300px;
            height: auto;
            min-height: 56px;
            position: relative;
            box-shadow: 0 2px 8px 0 rgba(44,62,80,.04);
            display: flex;
            align-items: center;
        }
        .emailkit-copy-paste-section span {
            font-size: 16px;
            font-weight: 500;
        }
        .emailkit-pro-badge {
            position: absolute;
            top: -10px;
            right: 12px;
            background: #ff5e8a;
            color: #fff;
            font-size: 12px;
            font-weight: 700;
            padding: 2px 14px 2px 14px;
            border-radius: 16px;
            box-shadow: 0 2px 8px 0 rgba(44,62,80,.08);
            z-index: 10;
            letter-spacing: 1px;
        }
        /* Toggle Switch Styles */
        .emailkit-switch {
            position: relative;
            display: inline-block;
            width: 46px;
            height: 24px;
            vertical-align: middle;
        }
        .emailkit-switch input {
            opacity: 0;
            width: 0;
            height: 0;
        }
        .emailkit-slider {
            position: absolute;
            cursor: pointer;
            top: 0; left: 0; right: 0; bottom: 0;
            background-color: #ccc;
            transition: .4s;
            border-radius: 24px;
        }
        .emailkit-slider:before {
            position: absolute;
            content: "";
            height: 18px;
            width: 18px;
            left: 3px;
            bottom: 3px;
            background-color: white;
            transition: .4s;
            border-radius: 50%;
        }
        .emailkit-switch input:checked + .emailkit-slider {
            background-color: #14c87c;
        }
        .emailkit-switch input:checked + .emailkit-slider:before {
            transform: translateX(22px);
        }
        .emailkit-switch-label {
            margin-left: 12px;
            font-weight: 500;
            vertical-align: middle;
        }
        .emailkit-switch-modern {
            position: relative;
            display: inline-block;
            width: 60px;
            height: 28px;
            margin: 0 0 0 auto;
            vertical-align: middle;
            flex-shrink: 0;
        }
        .emailkit-switch-modern input {
            opacity: 0;
            width: 0;
            height: 0;
        }
        .emailkit-switch-modern.disabled,
        .emailkit-switch-modern input:disabled + .emailkit-slider-modern {
            cursor: not-allowed;
        }
        .emailkit-copy-paste-section.disabled {
            cursor: pointer;
        }
        .emailkit-copy-paste-section.disabled .emailkit-switch-modern {
            pointer-events: none;
        }
        .emailkit-slider-modern {
            position: absolute;
            cursor: pointer;
            top: 0; left: 0; right: 0; bottom: 0;
            background-color: #f3f4f6;
            transition: background-color .4s;
            border-radius: 999px;
            display: flex;
            align-items: center;
            justify-content: center;
            border: 1.5px solid #e4e7ef;
        }
        .emailkit-switch-modern input:checked + .emailkit-slider-modern {
            background-color: #2563eb;
            border: 1.5px solid #2563eb;
        }
        .emailkit-slider-modern:before {
            position: absolute;
            content: "";
            height: 20px;
            width: 20px;
            left: 3px;
            top: 3px;
            background-color: #fff;
            border-radius: 50%;
            transition: transform .4s;
            z-index: 2;
            box-shadow: 0 2px 8px 0 rgba(44,62,80,.08);
        }
        .emailkit-switch-modern input:checked + .emailkit-slider-modern:before {
            transform: translateX(30px);
        }
        .emailkit-switch-text {
            position: absolute;
            top: 50%;
            transform: translateY(-50%);
            font-size: 12px !important;
            text-align: center;
            user-select: none;
            transition: color .4s, left .4s, right .4s;
            z-index: 1;
            font-weight: 600;
            letter-spacing: 0.5px;
            width: 22px;
        }
        .emailkit-switch-modern input:checked + .emailkit-slider-modern .emailkit-switch-text {
            left: 8px;
            right: auto;
            color: #fff;
        }
        .emailkit-switch-modern input:not(:checked) + .emailkit-slider-modern .emailkit-switch-text {
            right: 8px;
            left: auto;
            color: #b0b7c3;
        }
        /* Pro Modal Styles */
        .emailkit-pro-modal {
            display: none;
            position: fixed;
            z-index: 9999;
            left: 0;
            top: 0;
            width: 100%;
            height: 100%;
            background-color: rgba(0,0,0,0.5);
        }
        .emailkit-pro-modal-content {
            background-color: #fefefe;
            margin: 5% auto;
            padding: 40px;
            border-radius: 20px;
            width: 500px;
            max-width: 90%;
            text-align: center;
            position: relative;
            box-shadow: 0 20px 60px rgba(0,0,0,0.15);
        }
        .emailkit-pro-modal-close {
            position: absolute;
            top: 20px;
            right: 25px;
            color: #aaa;
            font-size: 28px;
            font-weight: bold;
            cursor: pointer;
            width: 30px;
            height: 30px;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        .emailkit-pro-modal-close:hover {
            color: #000;
        }
        .emailkit-pro-modal-icon {
            width: 80px;
            height: 80px;
            background: #e8f2ff;
            border-radius: 50%;
            margin: 0 auto 30px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 40px;
            color: #2563eb;
        }
        .emailkit-pro-modal-title {
            font-size: 32px;
            font-weight: 700;
            color: #333;
            margin-bottom: 15px;
        }
        .emailkit-pro-modal-text {
            font-size: 16px;
            color: #666;
            margin-bottom: 30px;
            line-height: 1.5;
        }
        .emailkit-pro-modal-link {
            color: #2563eb;
            text-decoration: underline;
            font-weight: 600;
        }
        .emailkit-disabled-overlay {
            cursor: pointer;
        }
        </style>
        <script>
        jQuery(document).ready(function ($) {
            "use strict";
            $('#emailkit-admin-switch__emailkit-user-consent-for-banner').on('change', function(){
                let val = ($(this).prop("checked") ? $(this).val() : 'no');
                let data = {
                    'settings' : {
                        'emailkit_user_consent_for_banner' : val, 
                    }, 
                    'nonce': "<?php echo esc_html(wp_create_nonce( 'ajax-nonce' )); ?>"
                };
                $.post( ajaxurl + '?action=emailkit_admin_action', data, function( data ) {
                    $('#success-notice').fadeIn().delay(1000).slideUp(); 
                });
            });

            function updateSwitchText() {
                var $switch = $('#emailkit-enable-copy-paste-switch');
                var $text = $switch.next('.emailkit-slider-modern').find('.emailkit-switch-text');
                if ($switch.is(':checked')) {
                    $text.text('ON');
                } else {
                    $text.text('OFF');
                }
            }
            
            function updateSwitchState() {
                var $switch = $('#emailkit-enable-copy-paste-switch');
                var $container = $('.emailkit-copy-paste-section');
                var isProActive = <?php echo esc_attr($is_pro_active ? 'true' : 'false'); ?>;

                if (isProActive) {
                    // Enable switch when Pro is active
                    $switch.prop('disabled', false);
                    $container.removeClass('disabled');
                    $('.emailkit-switch-modern').removeClass('disabled');
                } else {
                    // Disable switch when Pro is not active
                    $switch.prop('disabled', true).prop('checked', false);
                    $container.addClass('disabled');
                    $('.emailkit-switch-modern').addClass('disabled');
                }
                updateSwitchText();
            }
            
            updateSwitchState();
            
            $('#emailkit-enable-copy-paste-switch').on('change', function(){
                // Only allow changes if Pro is active
                if (<?php echo esc_attr($is_pro_active ? 'true' : 'false'); ?>) {
                    updateSwitchText();
                    let val = $(this).prop('checked') ? 'yes' : 'no';
                    let data = {
                        'copy_paste_enabled': val,
                        'nonce': "<?php echo esc_html(wp_create_nonce( 'ajax-nonce' )); ?>"
                    };
                    $.post(ajaxurl + '?action=emailkit_copy_paste_action', data, function(response) {
                        if (response.success) {
                            $('#success-notice').fadeIn().delay(1000).slideUp();
                        } else {
                            console.error('Failed to save copy-paste setting:', response.data.message);
                        }
                    });
                } else {
                    // Prevent changes and show modal if Pro is not active
                    $(this).prop('checked', false);
                    updateSwitchText();
                    $('#emailkit-pro-modal').show();
                }
            });

            // Pro Modal functionality
            $('.emailkit-copy-paste-section.disabled').on('click', function(e) {
                e.preventDefault();
                $('#emailkit-pro-modal').show();
            });

            $('.emailkit-pro-modal-close, .emailkit-pro-modal').on('click', function(e) {
                if (e.target === this) {
                    $('#emailkit-pro-modal').hide();
                }
            });
        }); // end ready function
        </script>

        <div id="success-notice" class="emailkit-success-notice"><?php esc_html_e( 'Success! Your action was completed.', 'emailkit' ); ?></div>
        <div class="emailkit-user-consent-for-banner notice notice-error">
        <p>
            <input type="checkbox" <?php echo esc_attr( \EmailKit\Promotional\Util::get_settings( 'emailkit_user_consent_for_banner', 'yes' ) == 'yes' ? 'checked' : '' ); ?>  value="yes" class="emailkit-admin-control-input" name="emailkit-user-consent-for-banner" id="emailkit-admin-switch__emailkit-user-consent-for-banner">
            <label for="emailkit-admin-switch__emailkit-user-consent-for-banner"><?php esc_html_e( 'Show update & fix related important messages, essential tutorials and promotional images on WP Dashboard', 'emailkit' ); ?></label>
        </p>
        </div>

        <!-- Copy-paste switch only -->
        <div class="emailkit-copy-paste-section<?php echo  esc_attr(!$is_pro_active) ? ' disabled' : ''; ?>">
            <?php if ($show_pro_badge): ?>
                <span class="emailkit-pro-badge">PRO</span>
            <?php endif; ?>
            <span style="flex: 1; margin-right: 16px;"><?php esc_html_e('Enable Copy Paste', 'emailkit'); ?></span>
            <label class="emailkit-switch-modern<?php echo esc_attr(!$is_pro_active) ? ' disabled' : ''; ?>">
                <input type="checkbox" id="emailkit-enable-copy-paste-switch" value="yes" <?php echo esc_attr(($is_pro_active && \EmailKit\Promotional\Util::get_settings('emailkit_enable_copy_paste', 'no') == 'yes') ? 'checked' : ''); ?> <?php echo esc_attr(!$is_pro_active ? 'disabled' : ''); ?> />
                <span class="emailkit-slider-modern">
                    <span class="emailkit-switch-text"></span>
                </span>
            </label>
        </div>

        <!-- Pro Modal -->
        <?php if (!$is_pro_active): ?>
        <div id="emailkit-pro-modal" class="emailkit-pro-modal">
            <div class="emailkit-pro-modal-content">
                <span class="emailkit-pro-modal-close">&times;</span>
                <div class="emailkit-pro-modal-icon">
                    <i style="font-style: normal; font-weight: bold;">i</i>
                </div>
                <h2 class="emailkit-pro-modal-title">Go Premium</h2>
                <p class="emailkit-pro-modal-text">
                    Purchase our <a href="<?php echo esc_url($buy_pro_url); ?>" target="_blank" class="emailkit-pro-modal-link">pro version</a> to unlock these premium features!
                </p>
            </div>
        </div>
        <?php endif; ?>
    <?php
    }
}