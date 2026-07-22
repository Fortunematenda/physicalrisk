<?php defined('ABSPATH') || exit; ?>
<form id="emailkit-form">
    <div class="attr-modal attr-fade" id="emailkit_new_form_modal" tabindex="-1" role="dialog" aria-labelledby="emailkit_new_form_modalLabel" style="display:none;">
        <div class="attr-modal-dialog attr-modal-dialog-centered" id="emailkit-new-form-modalinput-form" role="document">
            <div class="emailkit-add-new-form-modal-close-btn" data-dismiss="modal" aria-label="Close Modal">
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M13 1L1 13" stroke="#9FA1A6" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
                    <path d="M1 1L13 13" stroke="#9FA1A6" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
                </svg>

            </div>
            <div class="emailkit-add-new-form-model-header">
                <h2 class="emailkit-add-new-form-model-title" id="emailkit_new_form_modalLabel">
                    <?php esc_html_e('Create New Email', 'emailkit'); ?>
                </h2>

            </div>
            <div class="emailkit-add-new-form-model-contents">
                <div id="emailkit-notice" class="emailkit-notice"></div>
                <div class="emailkit-template-input-con">
                    <label for="emailkit-add-new-form-model__form-name">
                        <?php esc_html_e('Email Subject', 'emailkit'); ?>
                    </label>
                    <input id="emailkit-add-new-form-model__form-name" type="text" class="emailkit-editor-input" name="emailkit_template_title" placeholder="<?php esc_html_e('Enter template name', 'emailkit'); ?>">
                </div>

                <?php
                $email_types = [];


                $email_types = [
                    'wordpress' => __('WordPress Email', 'emailkit'),
                    'woocommerce' => __('WooCommerce email', 'emailkit'),
                    'metform' => __('Metform Email', 'emailkit'),
                    'saved-templates' => __('Saved Templates', 'emailkit'),
                ];
                ?>

                <div class="emailkit-template-form-type" id='emailType'>
                    <select id="emailkit-add-new-form-model__form-type" required name="emailkit_email_type" class="emailkit-editor-input emailkit_email_type" data-nonce="<?php echo esc_attr(wp_create_nonce('wp_rest')); ?>">
                        <option disabled='true' selected>
                            <?php esc_html_e('Select email type', 'emailkit'); ?>
                        </option>

                        <?php foreach ($email_types as $key => $type) { ?>
                            <option value="<?php echo esc_attr($key); ?>">
                                <?php echo esc_html($type); ?>
                            </option>
                        <?php } ?>
                    </select>
                    <div class="emailkit-template-form-type">
                        <select id="emailkit-add-new-email__template-type" class="emailkit-editor-input emailkit_template_type" name="emailkit_template_type" data-nonce="<?php echo esc_attr(wp_create_nonce('wp_rest')); ?>">
                            <option disabled='true' selected>
                                <?php esc_html_e('Select template type', 'emailkit'); ?>
                            </option>
                        </select>
                    </div>
                </div>



                <div class="emailkit-template-wrapper">

                </div>
                <div>
                    <div class="emailkit-template-alert-msg emailkit-select-template-type-msg">
                        <p>Please select a template.</p>
                    </div>
                    <ul class="emailkit-templates-list" style="position: relative;overflow-y: auto;height: 300px; overflow-x: hidden;">
                    <p class="emailkit-template-delete-success-notification" style="color: green; margin: auto; display: none;">Template Deleted Successfully.</p>
                        <div class="emailkit-template-loader-wrapper">
                            <div class="emailkit-template-loader"></div>
                        </div>
                        <div class="emailkit-saved-template-alert-msg emailkit-template-alert-msg emailkit-saved-template-info">
                            <div class="emailkit-template-alert-msg-wrap">
                                <p><span class="emailkit-saved-template-name"></span></p>
                                <button class="emailkit-saved-template-delete"><span style="display: inline-block; width: 14px; height: 15px"><svg  xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-6 h-6"><path stroke-linecap="round" stroke-linejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21q.512.078 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48 48 0 0 0-3.478-.397m-12 .562q.51-.089 1.022-.165m0 0a48 48 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a52 52 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a49 49 0 0 0-7.5 0"/></svg></span>Delete this template</button>

                                <div class="emailkit-template-delete-popover">
                                    <div class="emailkit-template-delete-popover-heading">
                                        <header>Do you want to delete?</header>
                                    </div>
                                    <div class="emailkit-template-delete-btns">
                                        <button class="emailkit-template-delete-btn emailkit-template-delete-btn-confirm">Yes</button>
                                        <button class="emailkit-template-delete-btn emailkit-template-delete-btn-cancel">No</button>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div class="emailkit-template-alert-msg emailkit-template-not-available">
                            <p>No saved templates available.</p>
                        </div>

                        <div class="emailkit-pro-alert-msg-wrapper">
                            <div class="emailkit-pro-alert-msg">
                                <div class="emailkit-pro-alert-msg-icon">
                                    <svg width="30" height="30" viewBox="0 0 30 30" fill="none" xmlns="http://www.w3.org/2000/svg">
                                        <path d="M15 30C23.2843 30 30 23.2843 30 15C30 6.71573 23.2843 0 15 0C6.71573 0 0 6.71573 0 15C0 23.2843 6.71573 30 15 30Z" fill="#227BFF" />
                                        <path d="M15 9V15" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
                                        <path d="M15 21H15.015" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
                                    </svg>
                                </div>
                                <div class="emailkit-pro-alert-msg-content">
                                    <h1 class="emailkit-pro-msg-title">You’re One Step Away!</h1>
                                    <p class="emailkit-pro-msg-content">Upgrade to Pro and get all the premium features!</p>
                                    <a href="https://wpmet.com/plugin/emailkit/pricing/" target="_blank" class="emailkit-pro-alert-msg-btn">Upgrade to Pro</a>
                                </div>
                            </div>

                        </div>
                        <li class="emailkit-blank-template">
                            <label>
                                <input class="emailkit-template-radio" name="emailkit-editor-template" type="radio" value="0" checked>
                                <div class="emailkit-template-radio-data">
                                    <img src="<?php echo esc_url(EMAILKIT_URL . 'assets/admin/img/blank.svg'); ?>" alt="<?php esc_html_e('Blank Template', 'emailkit'); ?>">
                                    <div class="emailkit-template-footer-content">
                                        <div class="emailkit-template-footer-title">
                                            <h2><?php esc_html_e('Blank Template', 'emailkit'); ?></h2>
                                        </div>
                                        <div class="emailkit-template-footer-links"><?php esc_html_e('Create From Scratch', 'emailkit'); ?></div>
                                    </div>
                                </div>
                            </label>
                        </li>
                    </ul>
                </div>


            </div>
            <div class="add-new-model__footer-button-group">
                <button id="editWithEmailkit" resturl="<?php echo esc_url(get_rest_url(null, "emailkit/v1/")) ?>" disabled="false" class="emailkit-open-new-form-editor-modal emailkit-edit-template-btn">
                    <?php esc_html_e('Edit with EmailKit', 'emailkit') ?>
                </button>
            </div>
        </div>
    </div>
    <?php include_once 'pro-popup.php'; ?>
</form>