<?php defined('ABSPATH') || exit; 

    $width = '760px';
    $bottom_margin = '20px';
    $bottom_spacing = has_action('after_confirmation_mail_to_user_switch') ? 'mf-form-bottom-spacing' : '';
    $refresh_icon_path = '<path fill="#4D4E50" d="M13.425 3.774A6.25 6.25 0 0 0 10.704.781 6.72 6.72 0 0 0 6.712.055 6.313 6.313 0 0 0 3.084 1.87L1.27 3.593V1.325A.715.715 0 0 0 .544.6C.091.6 0 .962 0 1.325v4.082c0 .09.09.09.09.09s0 .091.091.091l.091.091.09.09h4.083c.363 0 .725-.271.725-.634s-.362-.726-.725-.726H2.358l1.724-1.633c.726-.725 1.814-1.27 2.812-1.45 1.088-.182 2.177.09 3.175.543.907.545 1.723 1.361 2.177 2.359.453.998.544 2.086.272 3.175a5.26 5.26 0 0 1-1.633 2.72c-.816.817-1.905 1.27-2.993 1.27-1.089.091-2.177-.271-3.084-.816-.908-.635-1.633-1.45-1.996-2.54-.09-.272-.454-.544-.816-.362-.363.09-.545.544-.363.816.453 1.27 1.36 2.45 2.449 3.175 1.088.726 2.268 1.088 3.538 1.088h.362c1.361-.09 2.722-.634 3.72-1.542 1.088-.907 1.814-2.086 2.086-3.447a5.573 5.573 0 0 0-.363-3.99Z"/>';
    $close_icon = '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" fill="none"><path stroke="#545558" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M11 1 1 11M1 1l10 10"/></svg>';

    if(!function_exists('mf_dummy_simple_input')){
        function mf_dummy_simple_input( $params ){ 
            ?>
            <div class="mf-input-group mf-form-bottom-spacing">
                <?php
                if ( isset( $params['label'] ) && ! empty( $params['label'] ) ) : ?>
                    <label style="color: #9D9EA1" for="attr-input-label" class="attr-input-label">
                        <?php echo esc_html( $params['label'] ); ?>
                    </label>
                <?php endif; ?>
                <input 
                    disabled
                    type="text" 
                    class="attr-form-control" 
                    placeholder="<?php echo isset( $params['placeholder'] ) && ! empty( $params['placeholder'] ) ? esc_attr( $params['placeholder'] ) : ''; ?>"
                >
                <?php if ( isset( $params['help'] ) && ! empty( $params['help'] ) ) : ?>
                <span class="mf-input-help">
                    <?php echo esc_html( $params['help'] ); ?>
                </span>
                <?php endif;  ?>
            </div>
            <?php
            }
        }

        if(!function_exists('mf_dummy_switch_input')){
            function mf_dummy_switch_input( $params ){
                ?>
                <div class="mf-input-group mf-box-style mf-setting-disabled-input-wrapper">
                    <div class="mf-pro-badge mf-pro-badge-wrapper">
                        <div class="mf-svg-container">
                            <div class="mf-svg-inner mf-upgrade-btn">
                                <svg xmlns="http://www.w3.org/2000/svg" width="13" height="14" viewBox="0 0 13 14" fill="none"><path d="M10.225 6.025h-8.4a1.2 1.2 0 0 0-1.2 1.2v4.2a1.2 1.2 0 0 0 1.2 1.2h8.4a1.2 1.2 0 0 0 1.2-1.2v-4.2a1.2 1.2 0 0 0-1.2-1.2m-7.2 0v-2.4a3 3 0 1 1 6 0v2.4" stroke="#E81454" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round"/></svg>
                                <div class="mf-svg-text"><?php echo esc_html__('Upgrade', 'metform'); ?></div>
                            </div>
                        </div>
                        <div class="tooltip"><?php esc_html_e('Please upgrade to use this feature.', 'metform'); ?></div>
                    </div>
                    <label class="attr-input-label">
                        <input type="checkbox" disabled class="mf-admin-control-input">
                        <span>
                            <?php echo isset( $params['label'] ) && ! empty( $params['label'] ) ? esc_html( $params['label'] ) : ''; ?>
                        </span>
                    </label>
                    <span style="color: #9D9EA1" class='mf-input-help'><?php echo isset( $params['help'] ) && ! empty( $params['help'] ) ? esc_html( $params['help'] ) : ''; ?></span>
                </div>
                <?php
            }
        }
?>

<div class="attr-modal attr-fade" id="metform_form_modal" tabindex="-1" role="dialog" aria-labelledby="metform_form_modalLabel" style="display:none;">
    <div class="attr-modal-dialog attr-modal-dialog-centered" style="width: <?php echo esc_attr($width); ?>"; id="metform-form-modalinput-form" role="document">
        <form action="" method="post" id="metform-form-modalinput-settings" data-open-editor="0" data-editor-url="<?php echo esc_url(get_admin_url()); ?>" data-nonce="<?php echo esc_attr(wp_create_nonce('wp_rest')); ?>">
            <input type="hidden" name="post_author" value="<?php echo esc_attr(get_current_user_id()); ?>">
            <div class="attr-modal-content">
                <div class="attr-modal-header">
                    <button type="button" class="attr-close" data-dismiss="modal" aria-label="Close"><span aria-hidden="true">
                        <?php \MetForm\Utils\Util::metform_content_renderer( $close_icon); ?>
                    </span></button>
                    <h4 class="attr-modal-title" id="metform_form_modalLabel">
                        <?php esc_html_e('Form Settings', 'metform'); ?></h4>
                        <div id="message" style="display:none" class="attr-alert attr-alert-success mf-success-msg"> 
                            <div class="mf-notification-close"></div>
                            <div class="mf-message-body"></div>
                        </div>
                    <ul class="attr-nav attr-nav-tabs" role="tablist">
                        <li role="presentation" class="attr-active"><a href="#mf-general" aria-controls="general" role="tab" data-toggle="tab"><?php esc_html_e('General', 'metform'); ?></a>
                        </li>
                        <li role="presentation"><a href="#mf-confirmation" aria-controls="confirmation" role="tab" data-toggle="tab"><?php esc_html_e('Confirmation', 'metform'); ?></a>
                        </li>
                        <li role="presentation"><a href="#mf-notification" aria-controls="notification" role="tab" data-toggle="tab"><?php esc_html_e('Notification', 'metform'); ?></a>
                        </li>
                        <li role="presentation"><a href="#mf-integration" aria-controls="integration" role="tab" data-toggle="tab"><?php esc_html_e('Integration', 'metform'); ?></a>
                        </li>
                        <li role="presentation"><a href="#mf-payment" aria-controls="payment" role="tab" data-toggle="tab"><?php esc_html_e('Payment', 'metform'); ?></a>
                        </li>
                        <li role="presentation"><a href="#mf-crm" aria-controls="crm" role="tab" data-toggle="tab"><?php esc_html_e('CRM', 'metform'); ?></a></li>
                        <?php if ( !class_exists('MetForm_Pro\Base\Package') ) : ?>
                        <li role="presentation"><a href="#mf-dummy-auth" aria-controls="dummy-auth" role="tab" data-toggle="tab"><?php esc_html_e('Auth', 'metform'); ?></a>
                        </li>
                        <li role="presentation"><a href="#mf-dummy-post" aria-controls="dummy-post" role="tab" data-toggle="tab"><?php esc_html_e('Post', 'metform'); ?></a>
                        </li>
                        <?php endif; ?>
                        <?php do_action('mf_form_settings_tab'); ?>
                    </ul>
                </div>

                <div class="attr-tab-content">
                    <div role="tabpanel" class="attr-tab-pane attr-active" id="mf-general">
                        <div class="attr-modal-body" id="metform_form_modal_body">
                            <div class="mf-input-group mf-form-bottom-spacing">
                                <label for="attr-input-label" class="attr-input-label"><?php esc_html_e('Title:', 'metform'); ?></label>
                                <input type="text" name="form_title" class="mf-form-modalinput-title attr-form-control" data-default-value="<?php echo esc_html__('New Form # ', 'metform') . esc_attr(time()); ?>">
                                <span class='mf-input-help'><?php esc_html_e('This is the form title', 'metform'); ?></span>
                            </div>

                            <div class="mf-input-group mf-form-bottom-spacing">
                                <label for="attr-input-label" class="attr-input-label"><?php esc_html_e('Success Message:', 'metform'); ?></label>
                                <input type="text" name="success_message" class="mf-form-modalinput-success_message attr-form-control" data-default-value="<?php esc_html_e('Thank you! Form submitted successfully.', 'metform'); ?>">
                                <span class='mf-input-help'><?php esc_html_e('This message will be shown after a successful submission.', 'metform'); ?></span>
                            </div>

                            <?php if (class_exists('\MetForm_Pro\Core\Features\Quiz\Integration')) : ?>
                                <div class="mf-input-group mf-box-style">
                                    <label class="attr-input-label">
                                        <input type="checkbox" value="1" name="quiz_summery" class="mf-admin-control-input mf-form-modalinput-quiz_result_show">
                                        <span><?php esc_html_e('Show Quiz Summary:', 'metform'); ?></span>
                                    </label>
                                    <span class='mf-input-help'><?php esc_html_e('Quiz summary will be shown to user after form submission with success message.', 'metform'); ?></span>
                                </div>
                            <?php else: ?>
                            <?php mf_dummy_switch_input([
                                    'label' => __('Show Quiz Summary', 'metform'),
                                    'help' => __('Quiz summary will be shown to user after form submission with success message.', 'metform'),
                                    'badge' => __('Pro', 'metform'),
                                ]); ?>
                            <?php endif; ?>

                            <?php if(\MetForm\Utils\Util::is_using_feature('require_login') || class_exists('MetForm_Pro\Base\Package')): ?>
                            <div class="mf-input-group mf-box-style">
                                <label class="attr-input-label">
                                    <input type="checkbox" value="1" name="require_login" class="mf-admin-control-input mf-form-modalinput-require_login">
                                    <span><?php esc_html_e('Required Login:', 'metform'); ?></span>
                                </label>
                                <span class='mf-input-help'><?php esc_html_e('Without login, users can\'t submit the form.', 'metform'); ?></span>
                            </div>
                            <?php else: ?>
                                <?php mf_dummy_switch_input([
                                    'label' => __('Required Login', 'metform'),
                                    'help' => __('Without login, users can\'t submit the form.', 'metform'),
                                    'badge' => __('Pro', 'metform'),
                                ]); ?>
                            <?php endif; ?>

                            <?php if(\MetForm\Utils\Util::is_using_feature('capture_user_browser_data') || class_exists('MetForm_Pro\Base\Package')): ?>
                            <div class="mf-input-group mf-box-style">
                                <label class="attr-input-label">
                                    <input type="checkbox" value="1" name="capture_user_browser_data" class="mf-admin-control-input mf-form-modalinput-capture_user_browser_data">
                                    <span><?php esc_html_e('Capture User Browser Data:', 'metform'); ?></span>
                                </label>
                                <span class='mf-input-help'><?php esc_html_e('Store user\'s browser data (ip, browser name, etc)', 'metform'); ?></span>
                            </div>
                            <?php else: ?>
                                <?php mf_dummy_switch_input([
                                    'label' => __('Capture User Browser Data', 'metform'),
                                    'help' => __('Store user\'s browser data (ip, browser name, etc)', 'metform'),
                                    'badge' => __('Pro', 'metform'),
                                ]); ?>
                            <?php endif; ?>

                            <div class="mf-input-group mf-box-style">
                                <label class="attr-input-label">
                                    <input type="checkbox" value="1" name="hide_form_after_submission" class="mf-admin-control-input mf-form-modalinput-hide_form_after_submission">
                                    <span><?php esc_html_e('Hide Form After Submission:', 'metform'); ?></span>
                                </label>
                                <span class='mf-input-help'><?php esc_html_e('After submission, hide the form for preventing multiple submission.', 'metform'); ?></span>
                            </div>

                            <div class="mf-box-style">
                                <div class="mf-input-group">
                                    <label class="attr-input-label">
                                        <input type="checkbox" value="1" name="store_entries" class="mf-admin-control-input mf-form-modalinput-store_entries">
                                        <span><?php esc_html_e('Store Entries:', 'metform'); ?></span>
                                    </label>
                                    <span class='mf-input-help'><?php esc_html_e('Save submitted form data to database.', 'metform'); ?></span>
                                </div>

                                <div class="mf-input-group mf-entry-title">
                                    <label for="attr-input-label" class="attr-input-label"><?php esc_html_e('Entry Title', 'metform'); ?></label>
                                    <input type="text" name="entry_title" class="mf-entry-title-input attr-form-control" placeholder="Entry Title">
                                    <span class="mf-input-help"><?php esc_html_e('Enter here title of this form entries.', 'metform'); ?></span>
                                </div>
                            </div>

                            <?php if(\MetForm\Utils\Util::is_using_feature('limit_total_entries_status') || class_exists('MetForm_Pro\Base\Package')): ?>
                            <div class="mf-input-group mf-box-style">
                                <div class="mf-input-group-inner">
                                    <label class="attr-input-label">
                                        <input type="checkbox" value="1" name="limit_total_entries_status" class="mf-admin-control-input mf-form-modalinput-limit_status">
                                        <span><?php esc_html_e('Limit Total Entries:', 'metform'); ?></span>
                                    </label>
                                    <div class="mf-input-group" id='limit_status'>
                                        <input type="number" min="1" name="limit_total_entries" class="mf-form-modalinput-limit_total_entries attr-form-control">
                                    </div>
                                </div>
                                <span class='mf-input-help mf-limit-help'><?php esc_html_e('Limit the total number of submissions for this form.', 'metform'); ?></span>
                            </div>
                            <?php else: ?>
                                <?php mf_dummy_switch_input([
                                    'label' => __('Limit Total Entries', 'metform'),
                                    'help' => __('Limit the total number of submissions for this form.', 'metform'),
                                    'badge' => __('Pro', 'metform'),
                                ]); ?>
                            <?php endif; ?>
                            <?php if(class_exists('MetForm_Pro\Base\Package') ): ?>
                            <div class="mf-input-group mf-box-style">
                                <label class="attr-input-label">
                                    <input type="checkbox" value="1" name="form_scheduling_status" class="mf-admin-control-input mf-form-modalinput-form_scheduling_status">
                                    <span><?php esc_html_e('Form Scheduling:', 'metform'); ?></span>
                                </label>
                                <span class='mf-input-help'><?php esc_html_e('Start end time scheduling for form availability.', 'metform'); ?></span>

                                <div style="display: none;" id="mf-form-scheduling-fields">
                                    <div class="mf-input-group mf-input-group-inline mf-form-bottom-spacing">
                                        <label class="attr-input-label">
                                            <span><?php esc_html_e('Submission Starts', 'metform'); ?></span>
                                        </label>
                                        <div class="mf-input" id='submission_starts'>
                                            <input type="datetime-local" name="mf_scheduling_submission_starts" class="mf-form-modalinput-submission_starts attr-form-control">
                                        </div>
                                    </div>
                                    <div class="mf-input-group mf-input-group-inline mf-form-bottom-spacing">
                                        <label class="attr-input-label">
                                            <span><?php esc_html_e('Submission Ends', 'metform'); ?></span>
                                        </label>
                                        <div class="mf-input" id='submission_ends'>
                                            <input type="datetime-local" name="mf_scheduling_submission_ends" class="mf-form-modalinput-submission_ends attr-form-control">
                                        </div>
                                    </div>
                                    <div class="mf-input-group mf-input-group-inline mf-form-bottom-spacing">
                                        <label class="attr-input-label">
                                            <span><?php esc_html_e('Form Waiting Message', 'metform'); ?></span>
                                        </label>
                                        <div class="mf-input" id='form_waiting_message'>
                                            <input type="text" name="mf_scheduling_form_waiting_message" class="mf-form-modalinput-form_waiting_message attr-form-control" placeholder="<?php esc_html_e('This form is not available yet.', 'metform'); ?>" data-default-value="<?php esc_html_e('Form submission is not started yet.', 'metform'); ?>">
                                        </div>
                                    </div>
                                    <div class="mf-input-group mf-input-group-inline mf-form-bottom-spacing">
                                        <label class="attr-input-label">
                                            <span><?php esc_html_e('Expired  Message', 'metform'); ?></span>
                                        </label>
                                        <div class="mf-input" id='form_expired_message'>
                                            <input type="text" name="mf_scheduling_form_expired_message" class="mf-form-modalinput-form_expired_message attr-form-control" placeholder="<?php esc_html_e('This form is not available yet.', 'metform'); ?>" data-default-value="<?php esc_html_e('Form submission is now closed.', 'metform'); ?>">
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <?php else: ?>
                                <?php mf_dummy_switch_input([
                                    'label' => __('Form scheduling', 'metform'),
                                    'help' => __('Start end time scheduling for form availability.', 'metform'),
                                    'badge' => __('Pro', 'metform'),
                                ]); ?>
                            <?php endif; ?>
                            <?php if(\MetForm\Utils\Util::is_using_feature('count_views') || class_exists('MetForm_Pro\Base\Package')): ?>
                            <div class="mf-input-group mf-box-style">
                                <label class="attr-input-label">
                                    <input type="checkbox" value="1" name="count_views" class="mf-admin-control-input mf-form-modalinput-count_views">
                                    <span><?php esc_html_e('Count views:', 'metform'); ?></span>
                                </label>
                                <span class='mf-input-help'><?php esc_html_e('Track form views.', 'metform'); ?></span>
                            </div>
                            <?php else: ?>
                                <?php mf_dummy_switch_input([
                                    'label' => __('Count views', 'metform'),
                                    'help' => __('Track form views.', 'metform'),
                                    'badge' => __('Pro', 'metform'),
                                ]); ?>
                            <?php endif; ?>

                            <?php if( \MetForm\Utils\Util::is_using_feature('mf_stop_vertical_scrolling') || ( class_exists('MetForm_Pro\Base\Package') && (\MetForm\Utils\Util::is_old_pro_user() || \MetForm\Utils\Util::is_mid_tier() || \MetForm\Utils\Util::is_top_tier()))): ?>
                            <div class="mf-input-group mf-box-style">
                                <label class="attr-input-label">
                                    <input type="checkbox" value="1" name="mf_stop_vertical_scrolling" class="mf-admin-control-input mf-form-modalinput-stop_vertical_scrolling">
                                    <span><?php esc_html_e('Stop Vertical Scrolling:', 'metform'); ?></span>
                                </label>
                                <span class='mf-input-help'><?php esc_html_e('Stop scrolling effect when submitting the form.', 'metform'); ?></span>
                            </div>
                            <?php else: ?>
                                <?php mf_dummy_switch_input([
                                    'label' => __('Stop Vertical Scrolling', 'metform'),
                                    'help' => __('Stop scrolling effect when submitting the form.', 'metform'),
                                    'badge' => __('Pro', 'metform'),
                                ]); ?>
                            <?php endif; ?>

                            <div class="mf-input-group mf-form-top-spacing" style="margin-bottom: <?php echo esc_attr($bottom_margin); ?>";>
                                <label for="attr-input-label" class="attr-input-label"><?php esc_html_e('Redirect To:', 'metform'); ?></label>
                                <input type="text" name="redirect_to" class="mf-form-modalinput-redirect_to attr-form-control" placeholder="<?php esc_html_e('Redirection link', 'metform'); ?>">
                                <span class='mf-input-help'><?php esc_html_e('Users will be redirected to the this link after submission.', 'metform'); ?></span>
                            </div>
                             <?php if (!class_exists('MetForm_Pro\Base\Package')) :
                                mf_dummy_switch_input([
                                    'label' => __('Show Quiz Summary', 'metform'),
                                    'badge' => __('Pro', 'metform'),
                                ]);
                             endif; ?>

                            <?php do_action( 'mf_add_conditional_redirect_input' ); ?>

                            <?php if ( ! class_exists( 'MetForm_Pro\Base\Package' ) ) : ?>
                            <?php mf_dummy_switch_input( [
                                'label' => 'Conditional Redirect',
                                'badge' => 'Pro',
                            ] ); ?>
                            <?php endif; ?>

                             <?php if (!class_exists('MetForm_Pro\Base\Package')) :
                                mf_dummy_switch_input([
                                    'label' => __('Redirect form data', 'metform'),
                                    'badge' => __('Pro', 'metform'),
                                ]);
                             endif; ?>

                            <?php do_action('mf_add_url_databypass_input');  ?>

                        </div>
                    </div>
                    <div role="tabpanel" class="attr-tab-pane" id="mf-confirmation">
                        <div class="attr-modal-body" id="metform_form_modal_body">
                            <?php if(\MetForm\Utils\Util::is_using_feature('enable_user_notification') || class_exists('MetForm_Pro\Base\Package')): ?>
                            <div class="mf-input-group mf-box-style">
                                <label class="attr-input-label">
                                    <input type="checkbox" value="1" name="enable_user_notification" class="mf-admin-control-input mf-form-user-enable">
                                    <span><?php esc_html_e('Confirmation mail to user :', 'metform'); ?></span>
                                </label>
                                <span class='mf-input-help'>
                                    <?php esc_html_e('Want to send a submission copy to user by email? Active this one. ', 'metform'); ?>
                                    <strong><?php esc_html_e('This form must include at least one required Email field.', 'metform'); ?></strong>
                                </span>
                            </div>
                            <?php else: ?>
                                <?php mf_dummy_switch_input([
                                    'label' => __('Confirmation mail to user', 'metform'),
                                    'help' => __('Want to send a submission copy to user by email? Active this one. This form must include at least one required Email field.', 'metform'),
                                    'badge' => __('Pro', 'metform'),
                                ]); ?>
                            <?php endif; ?>
                            
                            <div class="mf-input-group mf-form-user-confirmation ">
                                <?php do_action('after_confirmation_mail_to_user_switch'); ?>
                            </div>

                            <div class="mf-input-group mf-form-user-confirmation mf-form-top-spacing mf-form-bottom-spacing">
                                <label for="attr-input-label" class="attr-input-label"><?php esc_html_e('Email Subject:', 'metform'); ?></label>
                                <input type="text" name="user_email_subject" class="mf-form-user-email-subject attr-form-control" placeholder="<?php esc_html_e('Email subject', 'metform'); ?>">
                                <span class='mf-input-help'><?php esc_html_e('Enter here email subject.', 'metform'); ?></span>
                            </div>

                            <div class="mf-input-group mf-form-user-confirmation mf-form-bottom-spacing">
                                <label for="attr-input-label" class="attr-input-label"><?php esc_html_e('Email From:', 'metform'); ?></label>
                                <input type="email" name="user_email_from" class="mf-form-user-email-from attr-form-control" placeholder="<?php esc_html_e('From email', 'metform'); ?>">
                                <span class='mf-input-help'><?php esc_html_e('Enter the email by which you want to send email to user.', 'metform'); ?></span>
                            </div>

                            <div class="mf-input-group mf-form-user-confirmation mf-form-bottom-spacing">
                                <label for="attr-input-label" class="attr-input-label"><?php esc_html_e('Email Reply To:', 'metform'); ?></label>
                                <input type="email" name="user_email_reply_to" class="mf-form-user-reply-to attr-form-control" placeholder="<?php esc_html_e('Reply to email', 'metform'); ?>">
                                <span class='mf-input-help'><?php esc_html_e('Enter email where user can reply/ you want to get reply.', 'metform'); ?></span>
                            </div>

                            <div class="mf-input-group mf-form-user-confirmation mf-form-bottom-spacing">
                                <label for="attr-input-label" class="attr-input-label"><?php esc_html_e('Thank you message :', 'metform'); ?></label>
                                <textarea name="user_email_body" id="" class="mf-form-user-email-body attr-form-control" cols="30" rows="3" placeholder="<?php esc_html_e('Thank you message!', 'metform'); ?>"></textarea>
                                <span class='mf-input-help'><?php esc_html_e('Enter here your message to include it in email body. Which will be send to user.', 'metform'); ?></span>
                            </div>

                            <?php if(\MetForm\Utils\Util::is_using_feature('user_email_attach_submission_copy') || class_exists('MetForm_Pro\Base\Package')): ?>
                            <div class="mf-input-group mf-box-style">
                                <label class="attr-input-label">
                                    <input type="checkbox" value="1" name="user_email_attach_submission_copy" class="mf-admin-control-input mf-form-user-submission-copy">
                                    <span><?php esc_html_e('Want to send a copy of submitted form to user ?', 'metform'); ?></span>
                                </label>
                            </div>
                            <?php else: ?>
                                <?php mf_dummy_switch_input([
                                    'label' => __('Want to send a copy of submitted form to user ?', 'metform'),
                                    'badge' => __('Pro', 'metform'),
                                ]); ?>
                            <?php endif; ?>

                            <?php if ( ! class_exists('MetForm_Pro\Base\Package') ) : 
                                mf_dummy_switch_input([
                                    'label' => esc_html__('Email verification:', 'metform'),
                                    'help' => esc_html__('Want to send an email verification mail to the user by email? Active this one. This form must include at least one required Email field.', 'metform'),
                                    'badge' => __('Pro', 'metform'),
                                ]);
                            endif; ?>

                            <?php do_action('get_metform_email_verification_settings') ?>
                        </div>
                    </div>
                    <div role="tabpanel" class="attr-tab-pane" id="mf-notification">
                        <div class="attr-modal-body" id="metform_form_modal_body">
                            <div class="mf-input-group mf-box-style">
                                <label class="attr-input-label">
                                    <input type="checkbox" value="1" name="enable_admin_notification" class="mf-admin-control-input mf-form-admin-enable">
                                    <span><?php esc_html_e('Notification mail to admin :', 'metform'); ?></span>
                                </label>
                                <span class='mf-input-help'><?php esc_html_e('Want to send a submission copy to admin by email? Active this one.', 'metform'); ?></span>
                            </div>

                            <div class="mf-input-group mf-form-admin-notification mf-form-bottom-spacing mf-form-top-spacing">
                                <label for="attr-input-label" class="attr-input-label"><?php esc_html_e('Email Subject:', 'metform'); ?></label>
                                <input type="text" name="admin_email_subject" class="mf-form-admin-email-subject attr-form-control" placeholder="<?php esc_html_e('Email subject', 'metform'); ?>">
                                <span class='mf-input-help'><?php esc_html_e('Enter here email subject.', 'metform'); ?></span>
                            </div>

                            <div class="mf-input-group mf-form-admin-notification mf-form-bottom-spacing">
                                <label for="attr-input-label" class="attr-input-label"><?php esc_html_e('Email To:', 'metform'); ?></label>
                                <input type="text" name="admin_email_to" class="mf-form-admin-email-to attr-form-control" placeholder="<?php esc_html_e('example@mail.com, example@email.com', 'metform'); ?>">
                                <span class='mf-input-help'><?php esc_html_e('Enter admin email where you want to send mail.', 'metform'); ?><strong><?php esc_html_e(' for multiple email addresses please use "," separator.', 'metform'); ?></strong></span>
                            </div>

                            <div class="mf-input-group mf-form-admin-notification mf-form-bottom-spacing">
                                <label for="attr-input-label" class="attr-input-label"><?php esc_html_e('Email From:', 'metform'); ?></label>
                                <input type="text" name="admin_email_from" class="mf-form-admin-email-from attr-form-control" placeholder="<?php esc_html_e('Email from', 'metform'); ?>">
                                <span class='mf-input-help'><?php esc_html_e('Enter the email by which you want to send email to admin.', 'metform'); ?></span>
                            </div>

                            <div class="mf-input-group mf-form-admin-notification mf-form-bottom-spacing">
                                <label for="attr-input-label" class="attr-input-label"><?php esc_html_e('Email Reply To:', 'metform'); ?></label>
                                <input type="text" name="admin_email_reply_to" class="mf-form-admin-reply-to attr-form-control" placeholder="<?php esc_html_e('Email reply to', 'metform'); ?>">
                                <span class='mf-input-help'><?php esc_html_e('Enter email where admin can reply/ you want to get reply.', 'metform'); ?></span>
                            </div>

                            <div class="mf-input-group mf-form-admin-notification mf-form-bottom-spacing">
                                <label for="attr-input-label" class="attr-input-label"><?php esc_html_e('Admin Note : ', 'metform'); ?></label>
                                <textarea name="admin_email_body" class="mf-form-admin-email-body attr-form-control" cols="30" rows="3" placeholder="<?php esc_html_e('Admin note!', 'metform'); ?>"></textarea>
                                <span class='mf-input-help'><?php esc_html_e('Enter here your email body. Which will be send to admin.', 'metform'); ?></span>
                            </div>
                        </div>

                    </div>
                    <div role="tabpanel" class="attr-tab-pane" id="mf-integration">
                        <div class="attr-modal-body" id="metform_form_modal_body">
                            <div class="mf-input-group mf-box-style">
                                <label class="attr-input-label">
                                    <input type="checkbox" value="1" name="mf_hubspot_forms" class="mf-admin-control-input mf-hubspot-forms">
                                    <span><?php esc_html_e('HubSpot Forms:', 'metform'); ?></span>
                                </label>
                                <span class='mf-input-help'><?php esc_html_e('Integrate hubspot with this form. ', 'metform'); ?><a target="_blank" href="<?php echo esc_url(get_dashboard_url()) . 'admin.php?page=metform-menu-settings#mf_crm'; ?>"><?php esc_html_e('Configure HubSpot.', 'metform'); ?></a></span>

                                <div class="hubspot_forms_section" style="margin-bottom: 4px;">

                                    <label class="attr-input-label">
                                        <span><?php esc_html_e('Fetch HubSpot Forms', 'metform'); ?></span>
                                        <span class="refresh-icon">
                                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="13" fill="none" class="metfrom-btn-refresh-hubsopt-list">
                                                <?php \MetForm\Utils\Util::metform_content_renderer( $refresh_icon_path); ?>
                                            </svg>
                                        </span>
                                    </label>
                                    <select name='hubspot_forms' class="attr-form-control hubspot_forms"></select>
                                    <input type="hidden" class="mf_hubspot_form_guid" name="mf_hubspot_form_guid">
                                    <input type="hidden" class="mf_hubspot_form_portalId" name="mf_hubspot_form_portalId">
                                    <div id="mf-hubsopt-fileds"></div>
                                </div>
                            </div>

                            <div class="mf-input-group">
                                <label class="attr-input-label mf-hubsopt-contact-label" style="margin-top: 0px;">
                                    <input type="checkbox" value="1" name="mf_hubspot" class="mf-admin-control-input mf-hubsopt">
                                    <span><?php esc_html_e('HubSpot Contact:', 'metform'); ?></span>
                                </label>
                            </div>

                            <!-- MailerLite Integration with tier check -->
                            <?php if (class_exists('MetForm_Pro\Core\Integrations\Mailerlite') && (\MetForm\Utils\Util::is_mid_tier() || \MetForm\Utils\Util::is_top_tier())) : ?>
                            <div class="mf-box-style">
                                <div class="mf-input-group">
                                    <label class="attr-input-label">
                                        <input type="checkbox" value="1" name="mf_mailerlite" class="mf-admin-control-input mf-form-modalinput-mailerlite">
                                        <span><?php esc_html_e('MailerLite:', 'metform'); ?></span>
                                    </label>
                                    <span class='mf-input-help'>
                                        <?php esc_html_e('Connect this form to MailerLite. ', 'metform'); ?>
                                        <strong><?php esc_html_e('This form must include at least one required Email field. ', 'metform'); ?>
                                            <a target="_blank" href="<?php echo esc_url(get_dashboard_url()) . 'admin.php?page=metform-menu-settings#mf-newsletter_integration'; ?>">
                                                <?php esc_html_e('Configure MailerLite.', 'metform'); ?>
                                            </a>
                                        </strong>
                                    </span>
                                </div>

                                <div class="mf-input-group mf-mailerlite mf-form-top-spacing" style="margin-bottom: 4px;">
                                    <label for="attr-input-label" class="attr-input-label">
                                        <span><?php esc_html_e('MailerLite Group:', 'metform'); ?></span>
                                        <span class="refresh-icon">
                                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="13" fill="none" class="metfrom-btn-refresh-mailerlite-list">
                                                <?php \MetForm\Utils\Util::metform_content_renderer( $refresh_icon_path); ?>
                                            </svg>
                                        </span>
                                    </label>

                                    <select class="attr-form-control mf-mailerlite-list-select">
                                        <option value=""><?php esc_html_e('Select a Group', 'metform'); ?></option>
                                    </select>
                                    <input type="hidden" name="mf_mailerlite_list_id" class="mf-mailerlite-list-id attr-form-control">
                                    <span class='mf-input-help'><?php esc_html_e('Select the MailerLite Group you would like to add your contacts to.', 'metform'); ?></span>
                                </div>

                                <div class="mf-input-group mf-mailerlite mf-mailerlite-fields-section mf-form-top-spacing">
                                    <div id="mf-mailerlite-fields-container">
                                    </div>
                                </div>
                            </div>
                            <?php else: ?>
                                <?php mf_dummy_switch_input([
                                    'label' => esc_html__('MailerLite:', 'metform'),
                                    'help' => esc_html__('Integrate MailerLite with this form. This form must include at least one required Email field.', 'metform'),
                                    'badge' =>'Pro'
                                ]); ?>
                            <?php endif; ?>

                            <?php if ( class_exists('MetForm_Pro\Base\Package') || \MetForm\Utils\Util::is_using_settings_option('mf_mailchimp_api_key')) : ?>
                                <div class="mf-box-style">
                                    <div class="mf-input-group">
                                        <label class="attr-input-label">
                                            <input type="checkbox" value="1" name="mf_mail_chimp" class="mf-admin-control-input mf-form-modalinput-mail_chimp">
                                            <span><?php esc_html_e('Mail Chimp:', 'metform'); ?></span>
                                        </label>
                                        <span class='mf-input-help'><?php esc_html_e('Integrate mailchimp with this form. ', 'metform'); ?><strong><?php esc_html_e('This form must include at least one required Email field. ', 'metform'); ?><a target="_blank" href="<?php echo esc_url(get_dashboard_url()) . 'admin.php?page=metform-menu-settings#mf-newsletter_integration'; ?>"><?php esc_html_e('Configure Mail Chimp.', 'metform'); ?></a></strong></span>
                                    </div>

                                    <div class="mf-input-group mf-mailchimp mf-form-top-spacing" style="margin-bottom: 4px;">
                                        <label for="attr-input-label" class="attr-input-label">
                                            <span><?php esc_html_e('MailChimp List ID:', 'metform'); ?></span>
                                            <span class="refresh-icon">
                                                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="13" fill="none" class="metfrom-btn-refresh-mailchimp-list">
                                                    <?php \MetForm\Utils\Util::metform_content_renderer( $refresh_icon_path); ?>
                                                </svg>
                                            </span>
                                        </label>

                                        <select class="attr-form-control mailchimp_list">

                                        </select>
                                        <input type="hidden" name="mf_mailchimp_list_id" class="mf-mailchimp-list-id attr-form-control" placeholder="<?php esc_html_e('Mailchimp contact list id', 'metform'); ?>">
                                    </div>
                                </div>
                            <?php else: ?>
                                <?php mf_dummy_switch_input([
                                    'label' => __('Mail Chimp:', 'metform'),
                                    'help' => __('Integrate mailchimp with this form. This form must include at least one required Email field.', 'metform'),
                                    'badge' => __('Pro', 'metform'),
                                ]); ?>
                            <?php endif; ?>

                            <?php if(\MetForm\Utils\Util::is_using_feature('mf_slack') || (class_exists('MetForm_Pro\Base\Package') && (\MetForm\Utils\Util::is_old_pro_user() || \MetForm\Utils\Util::is_mid_tier() || \MetForm\Utils\Util::is_top_tier()))): ?>
                                <div class="mf-box-style">
                                    <div class="mf-input-group">
                                        <label class="attr-input-label">
                                            <input type="checkbox" value="1" name="mf_slack" class="mf-admin-control-input mf-form-modalinput-slack">
                                            <span><?php esc_html_e('Slack:', 'metform'); ?></span>
                                        </label>
                                        <span class='mf-input-help'><?php esc_html_e('Integrate slack with this form. ', 'metform'); ?><strong><?php esc_html_e('slack info.', 'metform'); ?></strong></span>
                                    </div>

                                    <div class="mf-input-group mf-slack mf-form-top-spacing">
                                        <label for="attr-input-label" class="attr-input-label"><?php esc_html_e('Slack webhook:', 'metform'); ?></label>
                                        <input type="text" name="mf_slack_webhook" class="mf-slack-web-hook attr-form-control" placeholder="<?php esc_html_e('Slack webhook', 'metform'); ?>">
                                        <span class='mf-input-help'><?php esc_html_e('Enter here slack web hook. ', 'metform'); ?><a href="http://slack.com/apps/A0F7XDUAZ-incoming-webhooks"><?php esc_html_e('create from here', 'metform'); ?></a></span>
                                    </div>
                                </div>
                            <?php else: ?>
                                <?php mf_dummy_switch_input([
                                    'label' => __('Slack:', 'metform'),
                                    'help' => __('Integrate slack with this form.', 'metform'),
                                    'badge' => __('Pro', 'metform'),
                                ]); ?>
                            <?php endif ?>
                            <?php if (class_exists('MetForm_Pro\Core\Integrations\Rest_Api') && (\MetForm\Utils\Util::is_old_pro_user() || \MetForm\Utils\Util::is_top_tier() || \MetForm\Utils\Util::is_using_feature('mf_rest_api'))) : ?>
                                <div class="mf-box-style">
                                    <div class="mf-input-group mf-input-group-inner">
                                        <label class="attr-input-label">
                                            <input type="checkbox" value="1" name="mf_rest_api" class="mf-admin-control-input mf-form-modalinput-rest_api">
                                            <span><?php esc_html_e('REST API:', 'metform'); ?></span>
                                        </label>
                                        <span class='mf-input-help'><?php esc_html_e('Send entry data to third party api/webhook', 'metform'); ?></span>
                                    </div>

                                    <div class="mf-input-group mf-input-rest-api-group mf-form-top-spacing">
                                        <div class="mf-rest-api">
                                            <label for="attr-input-label" class="attr-input-label"><?php esc_html_e('URL/Webhook:', 'metform'); ?></label>
                                            <input type="text" name="mf_rest_api_url" class="mf-rest-api-url attr-form-control" placeholder="<?php esc_html_e('Rest api url/webhook', 'metform'); ?>">
                                            <span class='mf-input-help'><?php esc_html_e('Enter rest api url/webhook here.', 'metform'); ?></span>
                                        </div>
                                        <div class="mf-rest-api-key">
                                            <div id='rest_api_method' style="margin-bottom: 4px;">
                                                <select name="mf_rest_api_method" class="mf-rest-api-method attr-form-control">
                                                    <option value="POST"><?php esc_html_e('POST', 'metform'); ?></option>
                                                    <option value="GET"><?php esc_html_e('GET', 'metform'); ?></option>
                                                </select>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            <?php else:
                                mf_dummy_switch_input([
                                    'label' => esc_html__('REST API:', 'metform'),
                                    'help' => esc_html__('Send entry data to third parti api/webhook.', 'metform'),
                                    'badge' =>'Pro'
                                ]);
                            endif; ?>

                            <?php if (class_exists('\MetForm_Pro\Core\Integrations\Google_Sheet\WF_Google_Sheet')) : ?>
                                <div class="mf-box-style">
                                    <div class="mf-input-group">
                                        <label class="attr-input-label">
                                            <input type="checkbox" value="1" name="mf_google_sheet" class="mf-admin-control-input mf-form-modal_input-google_sheet">
                                            <span><?php esc_html_e('Google Sheet:', 'metform'); ?></span>
                                        </label>
                                        <span class='mf-input-help'><?php esc_html_e('Integrate google sheet with this form. ', 'metform'); ?><strong><a target="_blank" href="<?php echo esc_url(get_dashboard_url()) . 'admin.php?page=metform-menu-settings#mf-google_sheet_integration'; ?>"><?php esc_html_e('Configure Google Sheet.', 'metform'); ?></a></strong></span>
                                    </div>

                                    <div class="mf-google-spreadsheets-selection-div">
                                        <div class="mf-input-group mf-google-spreadsheets-selection mf-form-top-spacing mf-form-bottom-spacing">
                                            <label for="attr-input-label" class="attr-input-label">
                                                <span><?php esc_html_e('Spreadsheets List:', 'metform'); ?></span>
                                                <span class="refresh-icon  metfrom-btn-refresh-google-spreadsheets-list">
                                                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="13" fill="none" class="metfrom-btn-refresh-hubsopt-list">
                                                        <?php \MetForm\Utils\Util::metform_content_renderer( $refresh_icon_path); ?>
                                                    </svg>
                                                </span>
                                            </label>

                                            <select class="attr-form-control mf-google-spreadsheets-list">

                                            </select>
                                            <input type="hidden" name="mf_google_spreadsheets_list_id" class="mf-google-spreadsheets-list-id attr-form-control" placeholder="<?php esc_html_e('Google Spreadsheet list id', 'metform'); ?>">
                                        </div>
                                        <div class="mf-input-group mf-google-sheets-selection" style="margin-bottom: 4px;">
                                            <label for="attr-input-label" class="attr-input-label"><?php esc_html_e('Sheets List:', 'metform'); ?>
                                                <span class="refresh-icon">
                                                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="13" fill="none" class="metfrom-btn-refresh-google-sheets-list">
                                                        <?php \MetForm\Utils\Util::metform_content_renderer( $refresh_icon_path); ?>
                                                    </svg>
                                                </span>
                                            </label>
                                            <select class="attr-form-control mf-google-sheets-list">
                                            </select>
                                            <input type="hidden" name="mf_google_sheets_list_id" class="mf-google-sheets-list-id attr-form-control" placeholder="<?php esc_html_e('Google Sheet list title', 'metform'); ?>">
                                        </div>
                                    </div>
                                </div>
                            <?php else:    
                                mf_dummy_switch_input([
                                    'label' => esc_html__('Google Sheet:', 'metform'),
                                    'help' => esc_html__('Integrate google sheet with this form.', 'metform'),
                                    'badge' =>'Pro'
                                ]);
                            endif; ?>
                            
                            <?php if (class_exists(\MetForm_Pro\Base\Package::class) && class_exists('\MetForm_Pro\Core\Integrations\Dropbox\Dropbox_Access_Token')  && (\MetForm\Utils\Util::is_mid_tier() || \MetForm\Utils\Util::is_top_tier())) : ?>
                                <div class="mf-box-style">
                                    <div class="mf-input-group">
                                        <label class="attr-input-label">
                                            <input type="checkbox" value="1" name="mf_dropbox" class="mf-admin-control-input mf-form-modal_input-dropbox">
                                            <span><?php esc_html_e('Dropbox:', 'metform'); ?></span>
                                        </label>
                                        <span class='mf-input-help'><?php esc_html_e('Integrate dropbox with this form. ', 'metform'); ?><strong><a target="_blank" href="<?php echo esc_url(get_dashboard_url()) . 'admin.php?page=metform-menu-settings#mf-general_options'; ?>"><?php esc_html_e('Configure Dropbox.', 'metform'); ?></a></strong></span>
                                    </div>

                                    <div class="mf-input-group mf-dropbox-selection" style="margin-bottom: 4px;">
                                        <label for="attr-input-label" class="attr-input-label"><?php esc_html_e('Folder List:', 'metform'); ?>
                                            <span class="refresh-icon">
                                                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="13" fill="none" class="metfrom-btn-refresh-dropbox-folder-list">
                                                    <?php \MetForm\Utils\Util::metform_content_renderer( $refresh_icon_path); ?>
                                                </svg>
                                            </span>
                                        </label>
                                        <select class="attr-form-control mf-dropbox-folder-list">
                                        </select>
                                        <input type="hidden" name="mf_dropbox_list_id" class="mf-dropbox-folder-list-id attr-form-control" placeholder="<?php esc_html_e('Dropbox list title', 'metform'); ?>">
                                    </div>
                                </div>
                            <?php else:    
                                mf_dummy_switch_input([
                                    'label' => esc_html__('Dropbox:', 'metform'),
                                    'help' => esc_html__('Integrate dropbox with this form.', 'metform'),
                                    'badge' =>'Pro'
                                ]);
                            endif; ?>
                            <?php if ( class_exists('\MetForm_Pro\Core\Integrations\Google_Drive\MF_Google_Drive') ) : ?>
                                <div class="mf-box-style">
                                    <div class="mf-input-group">
                                        <label class="attr-input-label">
                                            <input type="checkbox" value="1" name="mf_google_drive" class="mf-admin-control-input mf-form-modal_input-google_drive">
                                            <span><?php esc_html_e('Google Drive:', 'metform'); ?></span>
                                        </label>
                                        <span class='mf-input-help'><?php esc_html_e('Integrate google drive with this form. ', 'metform'); ?><strong><a target="_blank" href="<?php echo esc_url(get_dashboard_url()) . 'admin.php?page=metform-menu-settings#mf-google_sheet_integration'; ?>"><?php esc_html_e('Configure Google Drive.', 'metform'); ?></a></strong></span>
                                    </div>

                                    <div class="mf-google-drive-folder-selection-div">
                                        <div class="mf-input-group mf-google-drive-folder-selection mf-form-top-spacing mf-form-bottom-spacing">
                                            <label for="attr-input-label" class="attr-input-label">
                                                <span><?php esc_html_e('Folder List:', 'metform'); ?></span>
                                                <span class="refresh-icon  metfrom-btn-refresh-google-drive-folder-list">
                                                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="13" fill="none" class="metfrom-btn-refresh-hubsopt-list">
                                                        <?php \MetForm\Utils\Util::metform_content_renderer( $refresh_icon_path); ?>
                                                    </svg>
                                                </span>
                                            </label>

                                            <select class="attr-form-control mf-google-drive-folder-list">

                                            </select>
                                            <input type="hidden" name="mf_google_drive_folder_list_id" class="mf-google-drive-folder-list-id attr-form-control" placeholder="<?php esc_html_e('Google Drive folder list id', 'metform'); ?>">
                                        </div>
                                    </div>
                                </div>
                            <?php else:    
                                mf_dummy_switch_input([
                                    'label' => esc_html__('Google Drive :', 'metform'),
                                    'help' => esc_html__('Integrate google drive file upload', 'metform'),
                                    'badge' =>'Pro'
                                ]);
                            endif; ?>
                            <?php if (did_action('xpd_metform_pro/plugin_loaded')) :

                                if (class_exists('\MetForm_Pro\Core\Integrations\Mail_Poet')) : ?>
                                    <div class="mf-box-style">
                                        <div class="mf-input-group">
                                            <label class="attr-input-label">
                                                <input type="checkbox" value="1" name="mf_mail_poet" class="mf-admin-control-input mf-form-modalinput-mail_poet">
                                                <span><?php esc_html_e('MailPoet:', 'metform'); ?></span>
                                            </label>
                                            <span class='mf-input-help'>
                                                <?php esc_html_e('Integrate MailPoet with this form.', 'metform'); ?>
                                                <strong><?php esc_html_e('This form must include at least one required Email field. ', 'metform'); ?>
                                                    <a target="_blank" href="<?php echo esc_url(get_dashboard_url()) . 'admin.php?page=metform-menu-settings#mf-newsletter_integration'; ?>">
                                                        <?php esc_html_e('Configure MailPoet.', 'metform'); ?>
                                                    </a>
                                                </strong>
                                            </span>
                                        </div>

                                        <div class="mf-input-group mf-mail-poet mf-form-top-spacing">
                                            <label for="attr-input-label" class="attr-input-label"><?php esc_html_e('MailPoet List ID:', 'metform'); ?></label>

                                            <select name="mf_mail_poet_list_id" class="mf-mail-poet-list-id attr-form-control">
                                                <option value=""> None</option>
                                            </select>

                                            <span class='mf-input-help'><?php esc_html_e('Enter here MailPoet list id. ', 'metform'); ?>
                                                <a id="met_form_mail_poet_get_list" href="#"><?php esc_html_e('Refresh List', 'metform'); ?></a>
                                                <span id="mf_mail_poet_info"></span>
                                            </span>
                                        </div> 
                                    </div>
                                <?php endif; ?>

                                <?php if ((class_exists('MetForm_Pro\Base\Package') && (\MetForm\Utils\Util::is_old_pro_user() || \MetForm\Utils\Util::is_mid_tier() || \MetForm\Utils\Util::is_top_tier())) || \MetForm\Utils\Util::is_using_feature('mf_mail_aweber') || \MetForm\Utils\Util::is_using_settings_option('met_form_aweber_mail_access_token_key')) : ?>
                                <div class="mf-box-style">
                                    <div class="mf-input-group">
                                        <label class="attr-input-label">
                                            <input type="checkbox" value="1" name="mf_mail_aweber" class="mf-admin-control-input mf-form-modalinput-mail_aweber">
                                            <span><?php esc_html_e('Aweber:', 'metform'); ?></span>
                                        </label>
                                        <span class='mf-input-help'>
                                            <?php esc_html_e('Integrate aweber with this form. ', 'metform'); ?>
                                            <strong><?php esc_html_e('This form must include at least one required Email field. ', 'metform'); ?>
                                                <a target="_blank" href="<?php echo esc_url(get_dashboard_url()) . 'admin.php?page=metform-menu-settings#mf-newsletter_integration'; ?>">
                                                    <?php esc_html_e('Configure aweber.', 'metform'); ?>
                                                </a>
                                            </strong>
                                        </span>
                                    </div>

                                    <div class="mf-input-group mf-aweber mf-form-top-spacing">
                                        <label for="attr-input-label" class="attr-input-label"><?php esc_html_e('Aweber List ID:', 'metform'); ?></label>

                                        <select name="mf_aweber_list_id" class="mf-aweber-list-id attr-form-control">
                                            <option class="mf_aweber_default_option" value=""> None</option>
                                        </select>
                                        <span class='mf-input-help'><?php esc_html_e('Enter here aweber list id. ', 'metform'); ?>
                                            <a id="met_form_aweber_get_list" href="#"><?php esc_html_e('Refresh List', 'metform'); ?></a>
                                            <span id="mf_aweber_info"></span>
                                        </span>
                                        <div id="mf-aweber-fields"></div>
                                    </div>
                                </div>
                                <?php endif; ?>

                                <?php if ((class_exists('\MetForm_Pro\Core\Integrations\Convert_Kit') && (\MetForm\Utils\Util::is_old_pro_user() || \MetForm\Utils\Util::is_mid_tier() || \MetForm\Utils\Util::is_top_tier())) || \MetForm\Utils\Util::is_using_settings_option('mf_ckit_api_key')) : ?>
                                <div class="mf-box-style">
                                    <div class="mf-input-group">
                                        <label class="attr-input-label">
                                            <input type="checkbox" value="1" name="mf_convert_kit" class="mf-admin-control-input mf-form-modalinput-ckit" />
                                            <span><?php esc_html_e('ConvertKit:', 'metform'); ?></span>
                                        </label>
                                        <span class='mf-input-help'>
                                            <?php esc_html_e('Integrate convertKit with this form. ', 'metform'); ?>
                                            <strong><?php esc_html_e('This form must include at least one required Email field. ', 'metform'); ?>
                                                <a target="_blank" href="<?php echo esc_url(get_dashboard_url()) . 'admin.php?page=metform-menu-settings#mf-newsletter_integration'; ?>">
                                                    <?php esc_html_e('Configure ConvertKit.', 'metform'); ?>
                                                </a>
                                            </strong>
                                        </span>
                                    </div>
                                    <div class="mf-input-group mf-ckit mf-form-top-spacing">
                                        <label for="attr-input-label" class="attr-input-label"><?php esc_html_e('ConvertKit Forms ID:', 'metform'); ?></label>
                                        <select name="mf_ckit_list_id" class="attr-form-control mf-ckit-list-id">
                                            <option value=""> None</option>
                                        </select>
                                        <span class='mf-input-help'><?php esc_html_e('Enter here ConvertKit form id. ', 'metform'); ?>
                                            <a id="met_form_ckit_get_list" href="#">
                                                <?php esc_html_e('Refresh List', 'metform'); ?>
                                            </a>
                                        </span>
                                    </div>
                                </div>
                                <?php endif; ?>
                            <?php else:
                                mf_dummy_switch_input([
                                    'label' => esc_html__('MailPoet:', 'metform'),
                                    'help' => esc_html__('Integrate MailPoet with this form. This form must include at least one required Email field.', 'metform'),
                                    'badge' =>'Pro'
                                ]);
                                mf_dummy_switch_input([
                                    'label' => esc_html__('SMS Integrations (Twilio):', 'metform'),
                                    'badge' =>'Pro'
                                ]);
                                mf_dummy_switch_input([
                                    'label' => esc_html__('SMS User:', 'metform'),
                                    'help' => esc_html__('Integrate SMS confirmation with this form.The form must have at least one mobile number widget and it should be required.', 'metform'),
                                    'badge' =>'Pro'
                                ]);
                                mf_dummy_switch_input([
                                    'label' => esc_html__('SMS Admin:', 'metform'),
                                    'badge' =>'Pro'
                                ]);
                            endif; ?>
                            <?php do_action('get_automixy_settings_content'); ?>

                            <!-- Aweber integration with tier check -->
                            <?php if (!((class_exists('MetForm_Pro\Base\Package') && (\MetForm\Utils\Util::is_old_pro_user() || \MetForm\Utils\Util::is_mid_tier() || \MetForm\Utils\Util::is_top_tier())) || \MetForm\Utils\Util::is_using_feature('mf_mail_aweber'))) :
                                mf_dummy_switch_input([
                                    'label' => esc_html__('Aweber:', 'metform'),
                                    'help' => esc_html__('Integrate aweber with this form. This form must include at least one required Email field.', 'metform'),
                                    'badge' =>'Pro'
                                ]);
                            endif; ?>

                            <!-- ConvertKit integration with tier check -->
                            <?php if (!((class_exists('\MetForm_Pro\Core\Integrations\Convert_Kit') && (\MetForm\Utils\Util::is_old_pro_user() || \MetForm\Utils\Util::is_mid_tier() || \MetForm\Utils\Util::is_top_tier())) || \MetForm\Utils\Util::is_using_settings_option('mf_ckit_api_key'))) :
                                mf_dummy_switch_input([
                                    'label' => esc_html__('ConvertKit:', 'metform'),
                                    'help' => esc_html__('Integrate convertKit with this form. This form must include at least one required Email field.', 'metform'),
                                    'badge' =>'Pro'
                                ]);
                            endif; ?>

                            <!-- GetResponse integration with tier check -->
                            <?php if (!((class_exists('\MetForm_Pro\Core\Integrations\Email\Getresponse\Get_Response') && (\MetForm\Utils\Util::is_old_pro_user() || \MetForm\Utils\Util::is_mid_tier() || \MetForm\Utils\Util::is_top_tier())) || \MetForm\Utils\Util::is_using_settings_option('mf_get_response_api_key'))) :
                                mf_dummy_switch_input([
                                    'label' => esc_html__('GetResponse:', 'metform'),
                                    'help' => esc_html__('Integrate GetResponse with this form. This form must include at least one required Email field.', 'metform'),
                                    'badge' =>'Pro'
                                ]);
                            endif; ?>

                            <!-- Zapier integration with tier check -->
                            <?php if (!((class_exists('\MetForm_Pro\Core\Integrations\Zapier') && (\MetForm\Utils\Util::is_old_pro_user() || \MetForm\Utils\Util::is_mid_tier() || \MetForm\Utils\Util::is_top_tier())) || \MetForm\Utils\Util::is_using_feature('mf_zapier'))) :
                                mf_dummy_switch_input([
                                    'label' => esc_html__('Zapier:', 'metform'),
                                    'help' => esc_html__('Integrate zapier with this form. This form must include at least one required Email field.', 'metform'),
                                    'badge' =>'Pro'
                                ]);
                            endif; ?>

                            <?php if ((class_exists('\MetForm_Pro\Core\Integrations\Email\Getresponse\Get_Response') && (\MetForm\Utils\Util::is_old_pro_user() || \MetForm\Utils\Util::is_mid_tier() || \MetForm\Utils\Util::is_top_tier())) || \MetForm\Utils\Util::is_using_settings_option('mf_get_response_api_key')) : ?>
                                <div class="mf-box-style">
                                    <div class="mf-input-group">
                                        <label class="attr-input-label">
                                            <input type="checkbox" value="1" name="mf_get_response" class="mf-admin-control-input mf-form-modalinput-get_response">
                                            <span><?php esc_html_e('GetResponse:', 'metform'); ?></span>
                                        </label>
                                        <span class='mf-input-help'>
                                            <?php esc_html_e('Integrate GetResponse with this form. ', 'metform'); ?>
                                            <strong><?php esc_html_e('This form must include at least one required Email field. ', 'metform'); ?>
                                                <a target="_blank" href="<?php echo esc_url(get_dashboard_url()) . 'admin.php?page=metform-menu-settings#mf-newsletter_integration'; ?>">
                                                    <?php esc_html_e('Configure GetResponse.', 'metform'); ?>
                                                </a>
                                            </strong>
                                        </span>
                                    </div>
                                    <div class="mf-input-group mf-get_response mf-form-top-spacing">
                                        <label for="attr-input-label" class="attr-input-label"><?php esc_html_e('GetResponse List ID:', 'metform'); ?>
                                            <span class="refresh-icon">
                                                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="13" fill="none" class="metfrom-btn-refresh-get-response-list">
                                                    <?php \MetForm\Utils\Util::metform_content_renderer( $refresh_icon_path); ?>
                                                </svg>
                                            </span>
                                        </label>
                                        <select class="attr-form-control get-response-campaign-list"></select>
                                        <input type="hidden" name="mf_get_response_list_id" class="mf-get_response-list-id attr-form-control" placeholder="<?php esc_html_e('GetResponse contact list id', 'metform'); ?>">
                                        <span class='mf-input-help'><?php esc_html_e('Enter here GetResponse list id. ', 'metform'); ?></span>
                                    </div>
                                </div>

                            <?php endif; ?>

                            <?php if (class_exists('\MetForm_Pro\Core\Integrations\Email\Activecampaign\Active_Campaign') && (\MetForm\Utils\Util::is_old_pro_user() || \MetForm\Utils\Util::is_top_tier() || \MetForm\Utils\Util::is_using_settings_option('mf_active_campaign_api_key'))) : ?>

                                <?php
                                $cached_email_list = get_option(\MetForm_Pro\Core\Integrations\Email\Activecampaign\Active_Campaign::CK_ACT_CAMP_EMAIL_LIST_CACHE_KEY, []);
                                $cached_tag_list = get_option(\MetForm_Pro\Core\Integrations\Email\Activecampaign\Active_Campaign::CK_ACT_CAMP_TAG_LIST_CACHE_KEY, []);
                                ?>
                                <div class="mf-box-style">

                                    <div class="mf-input-group">
                                        <label class="attr-input-label">
                                            <input type="checkbox" value="1" name="mf_active_campaign" class="mf-admin-control-input  mf-active-campaign">
                                            <span><?php esc_html_e('ActiveCampaign:', 'metform'); ?></span>
                                        </label>
                                        <span class='mf-input-help'>
                                            <?php esc_html_e('Integrate ActiveCampaign with this form.', 'metform'); ?>
                                            <strong>
                                                <?php esc_html_e('This form must include at least one required Email field. ', 'metform'); ?>
                                                <a target="_blank" href="<?php echo esc_url(get_dashboard_url()) . 'admin.php?page=metform-menu-settings#mf-newsletter_integration'; ?>">
                                                    <?php esc_html_e('Configure ActiveCampaign.', 'metform'); ?>
                                                </a>
                                            </strong>
                                        </span>
                                    </div>

                                    <div class="mf-input-group mf-active-campaign mf-form-top-spacing mf-form-bottom-spacing">
                                        <label for="attr-input-label" class="attr-input-label">
                                            <?php esc_html_e('Active campaign List ID:', 'metform'); ?>
                                        </label>
                                        <select name="mf_active_campaign_list_id" class="mf-active-camp-list-id attr-form-control">
                                            <?php
                                                if (!empty($cached_email_list)) {

                                                    foreach ($cached_email_list as $item) {

                                                        echo '<option value="' . esc_html($item['sid']) . '">' . esc_html($item['name']) . '</option>';
                                                    }
                                                }
                                            ?>
                                        </select>
                                        <span class='mf-input-help'><?php esc_html_e('Enter here list id. ', 'metform'); ?>
                                            <a id="met_form_act_camp_get_list" href="#"><?php esc_html_e('Refresh List', 'metform'); ?></a>
                                            <span id="mf_act_camp_info"> </span>
                                        </span>
                                    </div>
                                    <div class="mf-input-group mf-active-campaign">
                                        <label for="attr-input-label" class="attr-input-label"><?php esc_html_e('Active campaign Tag ID:', 'metform'); ?></label>
                                        <select name="mf_active_campaign_tag_id" class="mf-active-camp-list-id attr-form-control">
                                            <option value=""> None </option>
                                            <?php
                                                if (!empty($cached_tag_list)) {
                                                    foreach ($cached_tag_list as $item) {
                                                        echo '<option value="' . esc_html($item['sid']) . '">' . esc_html($item['name']) . '</option>';
                                                    }
                                                }
                                            ?>
                                        </select>
                                        <span class='mf-input-help'><?php esc_html_e('Enter here tag id. ', 'metform'); ?>
                                            <a id="met_form_act_camp_get_tags" href="#"><?php esc_html_e('Refresh List', 'metform'); ?></a>
                                            <span id="mf_act_camp_tag_info"> </span>
                                        </span>
                                    </div>
                                </div>
                            <?php else: 
                                mf_dummy_switch_input([
                                    'label' => esc_html__('ActiveCampaign:', 'metform'),
                                    'help' => esc_html__('Integrate ActiveCampaign with this form. This form must include at least one required Email field.', 'metform'),
                                    'badge' =>'Pro'
                                ]);
                            endif; ?>

                            <?php
                                if (function_exists('mailster')) {
                                    if (class_exists('\MetForm_Pro\Core\Integrations\Email\Mailster\Mailster')) :
                                    ?>
                                        <div class="mf-box-style">
                                            <div class="mf-input-group">
                                                <label class="attr-input-label">
                                                    <input type="checkbox" value="1" name="mf_mailster" class="mf-admin-control-input mf-form-modalinput-mailster">
                                                    <span><?php esc_html_e('Mailster:', 'metform'); ?></span>
                                                </label>
                                                <span class='mf-input-help'><?php esc_html_e('Integrate Mailster with this form.', 'metform'); ?><strong><?php esc_html_e('This form must include at least one required Email field. ', 'metform'); ?></strong></span>
                                            </div>

                                            <div class="mf-input-group mf-mailster-forms">
                                                <label for="attr-input-label" class="attr-input-label"><?php esc_html_e('Mailster Forms', 'metform'); ?></label>

                                                <select name="mf_mailster_list_id" class="mf-mailster-list-id attr-form-control">

                                                    <?php

                                                    $forms = mailster('forms')->get();
                                                    foreach ($forms as $form) :
                                                    ?>
                                                        <option value="<?php echo esc_attr($form->ID); ?>"><?php echo esc_html($form->name); ?></option>
                                                    <?php
                                                    endforeach;

                                                    ?>
                                                </select>
                                            </div>
                                            <div class="mf-input-group mf-mailster-settings-section"></div>
                                        </div>
                                    <?php
                                    endif;
                                }
                            ?>

                            <?php if ((class_exists('\MetForm_Pro\Core\Integrations\Zapier') && (\MetForm\Utils\Util::is_old_pro_user() || \MetForm\Utils\Util::is_mid_tier() || \MetForm\Utils\Util::is_top_tier())) || \MetForm\Utils\Util::is_using_feature('mf_zapier')) : ?>
                                <div class="mf-box-style">
                                    <div class="mf-input-group">
                                        <label class="attr-input-label">
                                            <input type="checkbox" value="1" name="mf_zapier" class="mf-admin-control-input mf-form-modalinput-zapier">
                                            <span><?php esc_html_e('Zapier:', 'metform'); ?></span>
                                        </label>
                                        <span class='mf-input-help'><?php esc_html_e('Integrate zapier with this form. ', 'metform'); ?><strong><?php esc_html_e('This form must include at least one required Email field.', 'metform'); ?></strong></span>
                                    </div>

                                    <div class="mf-input-group mf-zapier mf-form-top-spacing">
                                        <label for="attr-input-label" class="attr-input-label"><?php esc_html_e('Zapier webhook:', 'metform'); ?></label>
                                        <input type="text" name="mf_zapier_webhook" class="mf-zapier-web-hook attr-form-control" placeholder="<?php esc_html_e('Zapier webhook', 'metform'); ?>">
                                        <span class='mf-input-help'><?php esc_html_e('Enter here zapier web hook.', 'metform'); ?></span>
                                    </div>
                                </div>
                            <?php endif ?>

                            <?php do_action('metform_sms_integration_editor_markup') ?>
                        </div>
                    </div>

                    <div role="tabpanel" class="attr-tab-pane" id="mf-payment">
                        <div class="attr-modal-body" id="metform_form_modal_body">
                            <?php 
                            $currencies = [
                                'AUD' => __('Australian dollar', 'metform'),
                                'BRL' => __('Brazilian real', 'metform'),
                                'CAD' => __('Canadian dollar', 'metform'),
                                'CNY' => __('Chinese Renmenbi', 'metform'),
                                'CZK' => __('Czech koruna', 'metform'),
                                'DKK' => __('Danish krone', 'metform'),
                                'EUR' => __('Euro', 'metform'),
                                'HKD' => __('Hong Kong dollar', 'metform'),
                                'HUF' => __('Hungarian forint', 'metform'),
                                'ILS' => __('Israeli new shekel', 'metform'),
                                'JPY' => __('Japanese yen', 'metform'),
                                'MYR' => __('Malaysian ringgit', 'metform'),
                                'MXN' => __('Mexican peso', 'metform'),
                                'TWD' => __('New Taiwan dollar', 'metform'),
                                'NZD' => __('New Zealand dollar', 'metform'),
                                'NOK' => __('Norwegian krone', 'metform'),
                                'PHP' => __('Philippine peso', 'metform'),
                                'PLN' => __('Polish złoty', 'metform'),
                                'GBP' => __('Pound sterling', 'metform'),
                                'RUB' => __('Russian ruble', 'metform'),
                                'SGD' => __('Singapore dollar', 'metform'),
                                'SEK' => __('Swedish krona', 'metform'),
                                'CHF' => __('Swiss franc', 'metform'),
                                'THB' => __('Thai baht', 'metform'),
                                'USD' => __('United States dollar', 'metform'),
                            ];

                            // Check if at least one payment method is available
                            $paypal_available = (class_exists('\MetForm_Pro\Core\Integrations\Payment\Paypal') && (\MetForm\Utils\Util::is_old_pro_user() || \MetForm\Utils\Util::is_mid_tier() || \MetForm\Utils\Util::is_top_tier() || \MetForm\Utils\Util::is_using_settings_option('mf_paypal_email') || \MetForm\Utils\Util::is_using_feature('mf_paypal')));

                            $stripe_available = (class_exists('\MetForm_Pro\Core\Integrations\Payment\Stripe') && (\MetForm\Utils\Util::is_old_pro_user() || \MetForm\Utils\Util::is_mid_tier() || \MetForm\Utils\Util::is_top_tier() || \MetForm\Utils\Util::is_using_settings_option('mf_stripe_live_publishiable_key') || \MetForm\Utils\Util::is_using_settings_option('mf_stripe_test_secret_key') || \MetForm\Utils\Util::is_using_feature('mf_stripe')));
                            $show_currency = $paypal_available || $stripe_available;

                            if (!function_exists('is_plugin_active')) {
                                require_once ABSPATH . 'wp-admin/includes/plugin.php';
                            }

                            $payment_hold_addon_active = function_exists('is_plugin_active')
                                ? is_plugin_active('metform-payment-assistant/metform-payment-assistant.php')
                                : false;
                            ?>


                            <?php if ($show_currency) : ?>
                                <div class="mf-input-group mf-form-bottom-spacing">
                                    <label class="attr-input-label">
                                        <?php esc_html_e('Default currency', 'metform'); ?>
                                    </label>
                                    <select name="mf_payment_currency" id="" class="mf_payment_currency attr-form-control">
                                        <?php foreach ($currencies as $key => $value) { ?>
                                            <option value="<?php echo esc_attr($key); ?>" <?php echo esc_attr($key == 'USD' ? 'selected' : ''); ?>><?php echo esc_html($value) . ' (' . esc_html($key) . ')' ?></option>
                                        <?php } ?>
                                    </select>
                                </div>
                            <?php endif; ?>

                            <?php if ($paypal_available) : ?>
                                <div class="mf-input-group mf-box-style">
                                    <label class="attr-input-label">
                                        <input type="checkbox" value="1" name="mf_paypal" class="mf-admin-control-input mf-form-modalinput-paypal">
                                        <span><?php esc_html_e('Paypal:', 'metform'); ?></span>
                                    </label>
                                    <span class='mf-input-help'><?php esc_html_e('Integrate paypal payment with this form. ', 'metform'); ?>
                                        <a target="_blank" href="<?php echo esc_url(get_dashboard_url()) . 'admin.php?page=metform-menu-settings#mf-payment_options'; ?>"><?php esc_html_e('Configure paypal payment.', 'metform'); ?></a>
                                    </span>
                                </div>
                            <?php endif ?>

                            <?php if ($stripe_available) : ?>
                                <div class="mf-input-group mf-box-style">
                                    <label class="attr-input-label">
                                        <input type="checkbox" value="1" name="mf_stripe" class="mf-admin-control-input mf-form-modalinput-stripe">
                                        <span><?php esc_html_e('Stripe:', 'metform'); ?></span>
                                    </label>
                                    <span class='mf-input-help'><?php esc_html_e('Integrate stripe payment with this form. ', 'metform'); ?><a target="_blank" href="<?php echo esc_url(get_dashboard_url()) . 'admin.php?page=metform-menu-settings#mf-payment_options'; ?>"><?php esc_html_e('Configure stripe payment.', 'metform'); ?></a></span>
                                </div>
                            <?php endif ?>

                            <?php if ($payment_hold_addon_active && ($paypal_available || $stripe_available)) : ?>
                                <div class="mf-input-group mf-box-style mf-payment-submit-before-payment-option" style="display: none;">
                                    <label class="attr-input-label">
                                        <input type="hidden" name="mf_payment_submit_before_payment" value="0">
                                        <input type="checkbox" value="1" name="mf_payment_submit_before_payment" class="mf-admin-control-input mf-form-modalinput-payment_submit_before_payment">
                                        <span><?php esc_html_e('Require Payment For Submission?', 'metform'); ?></span>
                                    </label>
                                    <span class='mf-input-help'>
                                        <?php esc_html_e('Hold form submission before proceeding to payment.', 'metform'); ?>
                                    </span>
                                </div>
                            <?php endif; ?>

                            <?php if (!$show_currency) :
                                mf_dummy_simple_input(
                                    [
                                        'label' => esc_html__('Default Currency', 'metform'),
                                        'placeholder' => esc_html__('Select default currency', 'metform'),
                                        'badge' => 'Pro'
                                    ]
                                );
                            endif; ?>

                            <?php if (!$paypal_available) :
                                mf_dummy_switch_input(
                                    [
                                        'label' => esc_html__('Paypal:', 'metform'),
                                        'help' => esc_html__('Integrate paypal payment with this form.', 'metform')                                    ]
                                );
                            endif; ?>

                            <?php if (!$stripe_available) :
                                mf_dummy_switch_input(
                                    [
                                        'label' => esc_html__('Stripe:', 'metform'),
                                        'help' => esc_html__('Integrate stripe payment with this form.', 'metform')                                    ]
                                );
                            endif; ?>
                            </div>
                        </div>

                    <div role="tabpanel" class="attr-tab-pane" id="mf-crm">
                        <div class="attr-modal-body" id="metform_form_modal_body">
                            <?php if (class_exists('MetForm_Pro\Base\Package')) :
                                if (class_exists('\MetForm_Pro\Core\Integrations\Crm\Zoho\Integration') && (\MetForm\Utils\Util::is_old_pro_user() || \MetForm\Utils\Util::is_top_tier() || \MetForm\Utils\Util::is_using_settings_option('mf_zoho_data_center') || \MetForm\Utils\Util::is_using_feature('mf_zoho'))) : ?>
                                <!-- Zoho integration  -->
                                <div class="mf-input-group mf-box-style">
                                    <label class="attr-input-label">
                                        <input type="checkbox" value="1" name="mf_zoho" class="mf-admin-control-input mf-zoho">
                                        <span><?php esc_html_e('Zoho Contact:', 'metform'); ?></span>
                                    </label>
                                    <span class='mf-input-help'><?php esc_html_e('Integrate Zoho contacts with this form. ', 'metform'); ?>
                                        <a target="_blank" href="<?php echo esc_url(get_dashboard_url()) . 'admin.php?page=metform-menu-settings#mf_crm'; ?>"><?php esc_html_e('Configure Zoho.', 'metform'); ?></a>
                                    </span>
                                    <div style="display: none;" class="mf_zoho_forms_section">
                
                                        <div class="mf-input-group mf-form-top-spacing">
                                            <label class="attr-input-label"><?php esc_html_e('Form Fields', 'metform') ?></label>
                                            <div class="mf-cf-fields-btns">
                                                <p style="display:none" class="mf-zoho-error-msg"></p>
                                            </div>
                                            <div class="mf-inputs mf-cf-fields">
                                                <div id="mf-zoho-all-form-fields">
                                                    
                                                    <div id="mf-zoho-single-field" class="mf-cf-single-field mf-zoho-crm-single-field">
                                                        <div class="mf-cf-single-field-input">
                                                            <label><?php esc_html_e('Select Metform Field', 'metform') ?></label>
                                                            <select name="mf-zoho-custom-fields[]" class="mf-zoho-custom-fields attr-form-control ">

                                                            </select>
                                                        </div>
                                                        <div class="mf-cf-single-field-input">
                                                        <label><?php esc_html_e('Select Zoho Form Field', 'metform') ?></label>
                                                            <select  name="mf-zoho-form-fields[]" class="attr-form-control mf-zoho-form-fields mf-zoho-form-fields-url-copier" >

                                                            </select>
                                                        </div>
                                                        <a href="#" class="mf-btn-del-single-field mf-btn-del-single-field-zoho"><?php esc_html_e('Delete', 'metform') ?></a>
                                                    </div>
                                                </div>
                                                <button class="mf-add-zoho_fields mf-add-cf" type="button">
                                                    <span>
                                                        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" fill="white" viewBox="0 0 20 20">
                                                            <path fill="#000" fill-rule="evenodd" d="M9 17a1 1 0 1 0 2 0v-6h6a1 1 0 1 0 0-2h-6V3a1 1 0 1 0-2 0v6H3a1 1 0 0 0 0 2h6v6z"/>
                                                        </svg>
                                                    </span>
                                                    <span><?php esc_html_e('Add Field', 'metform'); ?></span>
                                                </button>
                                            </div>
                                        </div>
                                    </div>

                                </div>
                            <?php else: 
                                mf_dummy_switch_input([
                                    'label' => __('Zoho Contact:', 'metform'),
                                    'help' => __('Integrate Zoho Contact with this form.', 'metform'),
                                ]);
                           endif; ?>
                            <!-- Helpscout integration -->

                            <?php if (class_exists('\MetForm_Pro\Core\Integrations\Crm\Helpscout\Helpscout')) : ?>

                                <div class="mf-input-group mf-box-style">
                                    <label class="attr-input-label">
                                        <input type="checkbox" value="1" name="mf_helpscout" class="mf-admin-control-input mf-helpscout">
                                        <span><?php esc_html_e('Helpscout', 'metform'); ?></span>
                                    </label>
                                    <span class='mf-input-help'><?php esc_html_e('Integrate Helpscout with this form. ', 'metform'); ?><a target="_blank" href="<?php echo esc_url(get_dashboard_url()) . 'admin.php?page=metform-menu-settings#mf_crm'; ?>"><?php esc_html_e('Configure Helpscout.', 'metform'); ?></a></span>

                                    <div style="display: none;" class="helpscout_forms_section mf-form-top-spacing">

                                        <label class="attr-input-label">
                                            <span><?php esc_html_e('Available Mailboxes', 'metform'); ?></span>
                                        </label>

                                        <?php if (get_option('mf_helpscout_mailboxes') && is_array(get_option('mf_helpscout_mailboxes'))) : ?>
                                            <select id="mf_helpscout_mailbox" name='mf_helpscout_mailbox' class="attr-form-control helpscout_mailboxes">
                                                <?php foreach (get_option('mf_helpscout_mailboxes') as $mailbox) : ?>
                                                    <option value="<?php echo esc_attr($mailbox['id']); ?>"><?php echo esc_html($mailbox['name']); ?></option>
                                                <?php endforeach; ?>
                                            </select>
                                        <?php else : ?>
                                            <span><?php esc_html_e('No mailbox found', 'metform'); ?></span>
                                        <?php endif; ?>
                                        <br><br>
                                        <div id="mf-helpscout-fileds"></div>

                                    </div>
                                </div>

                            <?php endif; ?>

                            <div class="mf-box-style">

                                <?php do_action('metform_fluent_crm_editor_markup') ?>
                            </div>
                           <?php else:
                                mf_dummy_switch_input([
                                    'label' => __('Zoho Contact:', 'metform'),
                                    'help' => __('Integrate Zoho Contact with this form.', 'metform'),
                                ]);
                                mf_dummy_switch_input([
                                    'label' => __('Helpscout:', 'metform'),
                                    'help' => __('Integrate Helpscout with this form.', 'metform'),
                                ]);
                                mf_dummy_switch_input([
                                    'label' => __('Fluent:', 'metform'),
                                    'help' => __('Integrate fluent with this form.This form must include at least one required Email field.', 'metform'),
                                ]);
                            endif; 
                            ?>
                        </div>
                    </div>
                    <?php if (!class_exists('MetForm_Pro\Base\Package')) : ?>
                        <div role="tabpanel" class="attr-tab-pane" id="mf-dummy-auth">
                            <div class="attr-modal-body" id="metform_form_modal_body">
                                <?php
                                    mf_dummy_switch_input([
                                        'label' => __('Login', 'metform'),
                                        'help' => __('Enable or disable login system.', 'metform'),
                                    ]);
                                    mf_dummy_switch_input([
                                        'label' => __('Registration', 'metform'),
                                        'help' => __('Enable or disable user registration.', 'metform'),
                                    ]);
                                ?>
                            </div>
                        </div>
                        <div role="tabpanel" class="attr-tab-pane" id="mf-dummy-post">
                            <div class="attr-modal-body" id="metform_form_modal_body">
                                <?php
                                    mf_dummy_switch_input([
                                        'label' => __('Form to Post', 'metform'),
                                        'help' => __('Create a post from form entries.', 'metform'),
                                    ]); 
                                    ?>
                            </div>
                        </div>
                    <?php endif;  ?>

                    <?php do_action('mf_form_settings_tab_content'); ?>
                </div>

                <div class="attr-modal-footer">
                    <div class="footer-btn-group">
                        <button type="button" class="attr-btn attr-btn-default metform-form-save-btn-editor">
                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="none"><path fill="#fff" d="M10 0C4.477 0 0 4.477 0 10c0 5.522 4.477 10 10 10s10-4.477 10-10c-.002-5.523-4.478-10-10-10ZM7.5 14.165H5.835V5.833H7.5v8.332Zm6.665 0H9.166V12.5h5v1.665Zm0-3.333H9.166V9.166h5v1.666Zm0-3.333H9.166V5.833h5v1.666Z"/></svg>
                            <?php esc_html_e('Edit content', 'metform'); ?>
                        </button>
                        <button type="submit" class="attr-btn attr-btn-primary metform-form-save-btn"><?php esc_html_e('Save changes', 'metform'); ?></button>
                    </div>
                </div>

                <div class="mf-spinner"></div>
            </div>
        </form>
    </div>
</div>
