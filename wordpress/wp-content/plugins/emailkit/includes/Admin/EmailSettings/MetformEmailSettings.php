<?php

namespace EmailKit\Admin\EmailSettings;

use WP_Query;
use EmailKit\Admin\TemplateList;
use EmailKit\Admin\Emails\Helpers\Utils;

defined('ABSPATH') || exit;

class MetformEmailSettings
{

    public function __construct()
    {

        add_action('after_confirmation_mail_to_user_switch', [$this, 'metform_settings_content'], 10, 1);
        add_action('admin_enqueue_scripts', [$this, 'enqueue_metform_scripts']);
        add_filter('metform_confirmation_user_email_body', [$this, 'use_emailkit_template_for_user_email'], 10, 5);
    }

    /**
     * Enqueue JavaScript for MetForm EmailKit integration
     */
    public function enqueue_metform_scripts()
    {

        wp_enqueue_script("emailkit-admin-mf-js", EMAILKIT_ADMIN . 'EmailSettings/MFintegration.js', ['jquery'], EMAILKIT_VERSION, true);
        wp_localize_script(
            'emailkit-admin-mf-js',
            'metform',
            array(
                'ajaxurl' => admin_url('admin-ajax.php'),
                'nonce' => wp_create_nonce('emailkit_nonce'),
                'rest_url' => esc_url(get_rest_url(null, 'emailkit/v1/')),
                'rest_nonce' => wp_create_nonce('wp_rest')
            )
        );
    }

    /**
     * Add EmailKit settings content to MetForm notification settings
     */
    public function metform_settings_content($email)
    {
        $form_id = isset($email['id']) ? $email['id'] : 0;
        $mf_template_type = 'metform_form_' . $form_id; // Use form-specific template type

        $builder_url = '';
        $demo_url = '';
        $emailkit_email_type = '';
        $emailkit_template_title = '';
        $template_type = '';

        // Check for existing template with form-specific type
        $post_id = $this->get_emailkit_post_id($form_id, $mf_template_type);

        // If no form-specific template exists, check for generic metform template
        if (null === $post_id) {
            $emailkit_template = $this->find_emailkit_template($mf_template_type);

            if (isset($emailkit_template)) {
                $demo_url = $emailkit_template['file'] ?? '';
                $emailkit_email_type = $emailkit_template['mail_type'] ?? '';
                $emailkit_template_title = $emailkit_template['title'] ?? '';
                $template_type = $emailkit_template['template_type'] ?? '';
            }
        } else {
            $builder_url = admin_url("post.php?post={$post_id}&action=emailkit-builder");
        }

        $this->render_emailkit_edit_btn($builder_url, $demo_url, $emailkit_email_type, $emailkit_template_title, $template_type, $form_id);
    }


    /**
     * Render the EmailKit edit button for MetForm
     * 
     * @param string $builder_url The URL to the EmailKit builder for the specific template
     * @param string $demo_url The URL to the demo template
     * @param string $emailkit_email_type The type of email for EmailKit
     * @param string $emailkit_template_title The title of the EmailKit template
     * @param string $template_type The type of template (e.g., 'metform_form_123')
     * @param int $form_id The ID of the MetForm form
     * 
     * @return void
     */
    public function render_emailkit_edit_btn($builder_url, $demo_url, $emailkit_email_type, $emailkit_template_title, $template_type, $form_id)

    {
?>
        <div id="need-emailkit-pro-btn-wrap" class="emailkit-metform-btn need-emailkit-pro-btn">
            <div class="emailkit-upgrade-notice">
                <span class="emailkit-upgrade-text">
                    Get <strong>EmailKit Pro</strong> - the drag-and-drop builder to <br> customize your confirmation emails.
                </span>
                <a class="upgrade-button" target="_blank" href="https://wpmet.com/plugin/emailkit/pricing/">
                    <span><svg xmlns="http://www.w3.org/2000/svg" width="13" height="14" viewBox="0 0 13 14" fill="none">
                            <path d="M10.6 6.3999H2.2C1.53726 6.3999 1 6.93716 1 7.5999V11.7999C1 12.4626 1.53726 12.9999 2.2 12.9999H10.6C11.2627 12.9999 11.8 12.4626 11.8 11.7999V7.5999C11.8 6.93716 11.2627 6.3999 10.6 6.3999Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
                            <path d="M3.40015 6.4V4C3.40015 3.20435 3.71622 2.44129 4.27883 1.87868C4.84144 1.31607 5.6045 1 6.40015 1C7.1958 1 7.95886 1.31607 8.52147 1.87868C9.08408 2.44129 9.40015 3.20435 9.40015 4V6.4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
                        </svg>
                    </span> Upgrade to Pro
                </a>
            </div>
            <div id="dummy-emailkit-metform-button-wrap">
                <button disabled class="dummy-emailkit-metform-btn">
                    <span>
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="none">
                            <path d="M8 14.3164H15" stroke="#0D1427" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
                            <path d="M11.5 1.48325C11.8094 1.17383 12.2291 1 12.6667 1C12.8833 1 13.0979 1.04268 13.2981 1.12559C13.4982 1.20851 13.6801 1.33004 13.8333 1.48325C13.9865 1.63646 14.1081 1.81834 14.191 2.01852C14.2739 2.2187 14.3166 2.43325 14.3166 2.64992C14.3166 2.86659 14.2739 3.08113 14.191 3.28131C14.1081 3.48149 13.9865 3.66337 13.8333 3.81658L4.11111 13.5388L1 14.3166L1.77778 11.2055L11.5 1.48325Z" stroke="#0D1427" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
                        </svg>
                    </span>
                    <?php echo esc_html(__('Edit With Emailkit', 'emailkit')); ?>
                </button>
                <div class="dummy-info-tooltip">
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 18 18" fill="none">
                        <path d="M9 17C13.4183 17 17 13.4183 17 9C17 4.58172 13.4183 1 9 1C4.58172 1 1 4.58172 1 9C1 13.4183 4.58172 17 9 17Z" stroke="#54565C" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
                        <path d="M9 12.2V9" stroke="#54565C" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
                        <path d="M9 5.80005H9.008" stroke="#54565C" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
                    </svg>
                </div>
            </div>
        </div>
        <div id="emailkit-metform-button-wrap">
            <button class="emailkit-metform-btn metform-go-to-emailkit-builder-btn emailkit-metform-edit-button"
                target="_blank"
                href="<?php echo esc_url($builder_url) ?>"
                data-editor-template-url="<?php echo esc_attr($demo_url); ?>"
                data-emailkit-email-type="<?php echo esc_attr($emailkit_email_type); ?>"
                data-emailkit-template-title="<?php echo esc_attr($emailkit_template_title); ?>"
                data-emailkit-template-type="<?php echo esc_attr($template_type); ?>"
                data-emailkit-form="<?php echo esc_attr($form_id); ?>"
                data-emailkit-template="<?php echo esc_attr($emailkit_email_type); ?>&emailkit_template_type=<?php echo esc_attr($emailkit_template_title); ?>">
                <span>
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="none">
                        <path d="M8 14.3164H15" stroke="#0D1427" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
                        <path d="M11.5 1.48325C11.8094 1.17383 12.2291 1 12.6667 1C12.8833 1 13.0979 1.04268 13.2981 1.12559C13.4982 1.20851 13.6801 1.33004 13.8333 1.48325C13.9865 1.63646 14.1081 1.81834 14.191 2.01852C14.2739 2.2187 14.3166 2.43325 14.3166 2.64992C14.3166 2.86659 14.2739 3.08113 14.191 3.28131C14.1081 3.48149 13.9865 3.66337 13.8333 3.81658L4.11111 13.5388L1 14.3166L1.77778 11.2055L11.5 1.48325Z" stroke="#0D1427" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
                    </svg>
                </span>
                <?php echo esc_html(__('Edit With Emailkit', 'emailkit')); ?>
            </button>
            <div class="info-tooltip">
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 18 18" fill="none">
                    <path d="M9 17C13.4183 17 17 13.4183 17 9C17 4.58172 13.4183 1 9 1C4.58172 1 1 4.58172 1 9C1 13.4183 4.58172 17 9 17Z" stroke="#54565C" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
                    <path d="M9 12.2V9" stroke="#54565C" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
                    <path d="M9 5.80005H9.008" stroke="#54565C" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
                </svg>
                    <!-- <div class="icon">ℹ️</div> -->
                    <div class="metform-info-tooltip-text">
                        Customize your form confirmation email with EmailKit's drag and drop builder.
                    </div>

            </div>
        </div>
<?php
    }
    /**
     * Get EmailKit post ID based on template type
     */
    public function get_emailkit_post_id($form_id, $template_type)
    {
        $args = [
            'post_type'      => 'emailkit',
            'posts_per_page' => 1,
            'fields'         => 'ids', // Only retrieve post IDs for efficiency
            'meta_query'     => [
                'relation' => 'OR',
                [
                    'relation' => 'AND',
                    [
                        'key'     => 'emailkit_template_type',
                        'value'   => $template_type,
                        'compare' => '='
                    ],
                    [
                        'key'     => 'emailkit_template_status',
                        'value'   => 'active',
                        'compare' => '='
                    ]
                ]
            ]
        ];

        $query = new WP_Query($args);
        $post_ids = $query->posts;

        return !empty($post_ids) ? $post_ids[0] : null;
    }

    /**
     * Find EmailKit template based on template type
     */
    public function find_emailkit_template($template_type)
    {
        $templates = TemplateList::get_templates();

        // Check if this is a form-specific template
        $is_form_template = strpos($template_type, 'metform_form_') === 0;
        $form_id = $is_form_template ? str_replace('metform_form_', '', $template_type) : null;

        foreach ($templates as $key => $value) {
            // For form templates, match by ID
            if ($is_form_template && isset($value['id']) && $value['id'] == $form_id) {
                return [
                    'file' => $value['file'] ?? '',
                    'mail_type' => 'metform',
                    'template_type' => $template_type,
                    'title' => $value['template_title'] ?? esc_html__('Confirmation Mail To User', 'emailkit'),
                ];
            }
        }

        // Fallback to first available metform template if no exact match
        foreach ($templates as $value) {
            if (($value['mail_type'] ?? '') === 'metform') {
                return [
                    'file' => $value['file'] ?? '',
                    'mail_type' => 'metform',
                    'template_type' => $template_type,
                    'title' => $value['template_title'] ?? esc_html__('Confirmation Mail To User', 'emailkit'),
                ];
            }
        }

        return [];
    }

    /**
     * Customize the MetForm user email body using an EmailKit template
     *
     * @param string $body The default email body
     * @param int $form_id The ID of the MetForm form
     * @param array $form_data The submitted form data
     * @param array $file_info The uploaded file information
     * @return string The modified email body
     */
    public function use_emailkit_template_for_user_email($body, $form_id, $form_data, $file_info, $form_settings)
    {

        // Define the template type
        $template_type = 'metform_form_' . $form_id;

        // Get the post_id using the reusable method
        $post_id = $this->get_emailkit_post_id($form_id, $template_type);

        // If no form-specific template exists, return original MetForm content
        if (!$post_id) {
            return $body;
        }

        // Retrieve the EmailKit template HTML from post meta
        $template_html = get_post_meta($post_id, 'emailkit_template_content_html', true);

        // If we have template content, use it
        if (!empty($template_html)) {
            $template_content = $template_html;

            // Append formatted form data if the "attach submission copy" setting is enabled
            if (
                isset($form_settings['user_email_attach_submission_copy']) &&
                $form_settings['user_email_attach_submission_copy'] === '1'
            ) {
                $form_html = \MetForm\Core\Entries\Form_Data::format_data_for_mail($form_id, $form_data, $file_info);
                $template_content .= $form_html;
            }

            return $template_content;
        }

        // Fallback to original MetForm content if no template content found
        return $body;
    }
}
