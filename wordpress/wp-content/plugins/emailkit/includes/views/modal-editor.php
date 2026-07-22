<?php defined('ABSPATH') || exit; ?>

<div class="attr-modal attr-fade" id="emailkit_form_modal" tabindex="-1" role="dialog"
    aria-labelledby="emailkit_form_modalLabel" style="display:none;">
    <div class="attr-modal-dialog attr-modal-dialog-centered" id="emailkit-form-modalinput-form" role="document">

        <div class="emailkit_update_container">
            <div class="emailkit_update_header">
                <div>
                    <form action="" method="post" id="emailkit-form-modalinput-settings" class="" data-open-editor="0"
                        data-editor-url="<?php echo esc_url(get_admin_url()); ?>">
                        <span class="update_close_icon" data-dismiss="modal" aria-label="Close Modal">
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 14 14"
                                fill="none">
                                <path d="M13 1L1 13" stroke="#9FA1A6" stroke-width="1.5" stroke-linecap="round"
                                    stroke-linejoin="round" />
                                <path d="M1 1L13 13" stroke="#9FA1A6" stroke-width="1.5" stroke-linecap="round"
                                    stroke-linejoin="round" />
                            </svg>
                        </span>
                </div>
                <div class="header_title">
                    <h2>
                        <?php esc_html_e('Update Template', 'emailkit') ?>
                    </h2>
                    <p class="emailkit_update_subtitle">
                        <?php esc_html_e('Are you referring to updating the email template', 'emailkit'); ?>
                    </p>
                </div>
            </div>
            <div class="emailkit_update_inputs">

                <input type="text" name="emailkit_template_name" class="update_template_name" value=""
                    placeholder="<?php esc_html_e('Enter Template Name', 'emailkit') ?>">
                <input type="hidden" name="template_id" value="" id="template_id">
                <?php wp_nonce_field('update_emailkit_template') ?>
                <div class="emailkit_update_buttons">
                    <button class="save_changes_button emailkit_update_template" data-action-type="savechange">
                        <?php esc_html_e('Save Changes', 'emailkit') ?>
                    </button>
                    <button class="emailkit_update_template loadbuilder" data-action-type="loadbuilder">
                        <?php esc_html_e('Edit with EmailKit', 'emailkit') ?>
                    </button>
                </div>
            </div>
            </form>
        </div>
    </div>
</div>