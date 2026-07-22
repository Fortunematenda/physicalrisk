<?php

namespace EmailKit\Admin\EmailSettings;

use WP_Query;

defined('ABSPATH') || exit;

/**
 * Simple MetForm Shortcode Processor for EmailKit
 * 
 * Handles MetForm shortcode replacement in EmailKit email templates.
 * Supports {{}} and [] bracket formats.
 * 
 * @since 1.0.0
 */
class MetformShortcodes
{
    /**
     * Form data for shortcode processing
     *
     * @var array
     */
    private $form_data = [];

    /**
     * Initialize the shortcode processor
     */
    public function __construct()
    {
        add_filter('metform_confirmation_user_email_body', [$this, 'process_shortcodes'], 15, 5);
    }

    /**
     * Process MetForm shortcodes in EmailKit email templates
     *
     * @param string $body Email body content
     * @param int $form_id Form ID
     * @param array $form_data Form submission data
     * @param array $file_info File upload info
     * @param array $form_settings Form settings
     * @return string Processed email body
     */
    public function process_shortcodes($body, $form_id, $form_data, $file_info, $form_settings)
    {
        if (!class_exists('\\MetForm\\Plugin') || empty($form_data)) {
            return $body;
        }

        // Check if EmailKit template exists for this form
        $template_type = 'metform_form_' . $form_id;
        $post_id = $this->get_emailkit_post_id($form_id, $template_type);
        
        // Only process shortcodes if EmailKit template exists
        if (!$post_id) {
            // No EmailKit template found, return original MetForm body without processing
            return $body;
        }

        // EmailKit template exists, get template content and process shortcodes
        $this->form_data = $form_data;
        $emailkit_body = $this->use_emailkit_template_for_user_email($body, $form_id, $form_data, $file_info, $form_settings);
        
        // Process shortcodes in EmailKit template
        $processed_body = $this->replace_shortcodes($emailkit_body);

        return $processed_body;
    }

    /**
     * Replace all MetForm shortcodes with form data values
     *
     * @param string $body Email body content
     * @return string Processed email body
     */
    private function replace_shortcodes($body)
    {
        // Replace direct field shortcodes (both formats)
        foreach ($this->form_data as $field_name => $field_value) {
            if (empty($field_value)) {
                continue;
            }

            $value = is_array($field_value) ? implode(', ', $field_value) : $field_value;
            $escaped_value = esc_html($value);

            // Replace {{field}} and [field] formats
            $body = str_replace('{{' . $field_name . '}}', $escaped_value, $body);
            $body = str_replace('[' . $field_name . ']', $escaped_value, $body);


            // Replace EmailKit span-wrapped shortcodes
            $pattern = '/<span data-shortcode="\{\{' . preg_quote($field_name, '/') . '\}\}">([^<]*)<\/span>/';
            $replacement = '<span data-shortcode="{{' . $field_name . '}}">' . $escaped_value . '</span>';
            $body = preg_replace($pattern, $replacement, $body);
        }

        return $body;
    }

    /**
     * Use EmailKit template for user email if available
     *
     * @param string $body Email body content
     * @param int $form_id Form ID
     * @param array $form_data Form submission data
     * @param array $file_info File upload info
     * @param array $form_settings Form settings
     * @return string Processed email body
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

    /**
     * Get EmailKit post ID based on template type
     *
     * @param int $form_id Form ID
     * @param string $template_type Template type
     * @return int|null Post ID or null if not found
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

}