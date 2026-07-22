<?php
namespace MetForm\Core\Entries;

defined('ABSPATH') || exit;

class Hooks
{
    use \MetForm\Traits\Singleton;

    public function __construct()
    {

        add_filter('manage_metform-entry_posts_columns', [$this, 'set_columns']);
        add_action('manage_metform-entry_posts_custom_column', [$this, 'render_column'], 10, 2);
        add_filter('post_row_actions', [$this, 'remove_row_actions'], 10, 2);
        add_filter('parse_query', [$this, 'query_filter']);
        add_filter('wp_mail_from_name', [$this, 'wp_mail_from']);
        add_filter('upload_mimes', [$this, 'metfom_additional_upload_mimes']);
        

        // Check if file deletion is enabled in settings
        $settings = get_option('metform_option__settings');
        
       if (isset($settings['mf_enable_entry_file_delete']) && $settings['mf_enable_entry_file_delete'] == '1') {
            // Add hooks to delete uploaded files when entries are deleted
            add_action('before_delete_post', [$this, 'delete_entry_files'], 10, 2);
        }
       
        
    }

    public function set_columns($columns)
    {

        $date_column = $columns['date'];

        unset($columns['date']);

		$columns['form_name'] = esc_html__('Form Name', 'metform');
		
        $columns['referral'] = esc_html__('Referral','metform');

        $columns['email_verified'] = esc_html__('Email Verified','metform');

        $columns['date'] = esc_html($date_column);
        $columns['actions'] = esc_html__('Actions', 'metform');

        
        return $columns;
    }

    public function render_column($column, $post_id)
    {
        if(!empty(get_option('permalink_structure', true))) {
            $entry_api = get_rest_url('', 'metform-pro/v1/pdf-export/entry?entry_id');
        }else{
            $entry_api = get_rest_url('', 'metform-pro/v1/pdf-export/entry&entry_id');
        }

        switch ($column) {
            case 'form_name':
                $form_id = (int) get_post_meta( $post_id, 'metform_entries__form_id', true );
                $form_name = get_post( $form_id );
                $post_title = isset( $form_name->post_title ) ? $form_name->post_title : '';

                global $wp;
                $current_url = add_query_arg( $wp->query_string . '&mf_form_id=' . $form_id, '', home_url( $wp->request ) );

                \MetForm\Utils\Util::metform_content_renderer( '<a data-metform-form-id="' . esc_attr( $form_id ) . '" class="mf-entry-filter mf-entry-flter-form_id" href="' . esc_url( $current_url ) . '">' . esc_html( $post_title ) . '</a>' );
                break;

            case 'referral':
                $page_id = (int) get_post_meta( $post_id, 'mf_page_id', true );

                global $wp;
                $current_url = add_query_arg( $wp->query_string . '&mf_ref_id=' . $page_id, '', home_url( $wp->request ) );

                \MetForm\Utils\Util::metform_content_renderer( '<a class="mf-entry-filter mf-entry-flter-form_id" href="' . esc_url( $current_url ) . '">' . esc_html( get_the_title( $page_id ) ) . '</a>' );
                break;
            
            case 'email_verified':
                if(class_exists('\MetForm_Pro\Plugin')) :
                    $email_verified = get_post_meta($post_id, 'email_verified', true);
                    if($email_verified == true) : ?>
                        <span class="mf-verified-badge mf-verified-badge--yes"><?php echo esc_html__('Yes', 'metform'); ?></span>
                    <?php else : ?>
                        <span class="mf-verified-badge mf-verified-badge--no"><?php echo esc_html__('No', 'metform'); ?></span>
                    <?php endif;
                else: ?>
                    <div class="mf-entry-pro mf-svg-container">
                        <div class="mf-svg-inner mf-upgrade-btn">
                            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
<path d="M9.62305 5.24984V3.7915C9.62305 2.34176 8.44781 1.1665 6.99805 1.1665C5.5483 1.1665 4.37305 2.34176 4.37305 3.7915V5.24984" stroke="#735D05" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
<path d="M7.87286 5.25H6.12321C4.76123 5.25 4.08024 5.25 3.56476 5.52555C3.15775 5.74312 2.82439 6.07653 2.60686 6.48352C2.33136 6.99907 2.33142 7.68005 2.33155 9.04202C2.33167 10.4038 2.33174 11.0847 2.60727 11.6001C2.82483 12.007 3.15817 12.3403 3.56515 12.5578C4.08058 12.8333 4.76146 12.8333 6.12321 12.8333H7.87286C9.23471 12.8333 9.91569 12.8333 10.4311 12.5578C10.8381 12.3403 11.1715 12.0069 11.389 11.5999C11.6645 11.0844 11.6645 10.4035 11.6645 9.04167C11.6645 7.67982 11.6645 6.99889 11.389 6.4834C11.1715 6.07641 10.8381 5.74306 10.4311 5.52551C9.91569 5.25 9.23471 5.25 7.87286 5.25Z" stroke="#735D05" stroke-width="1.2" stroke-linecap="round"/>
<path d="M6.99821 10.2083C7.64254 10.2083 8.16488 9.686 8.16488 9.04167C8.16488 8.39733 7.64254 7.875 6.99821 7.875C6.35388 7.875 5.83154 8.39733 5.83154 9.04167C5.83154 9.686 6.35388 10.2083 6.99821 10.2083Z" stroke="#735D05" stroke-width="1.2"/>
</svg>
                            <div class="mf-svg-text"><?php echo esc_html__('Upgrade', 'metform'); ?></div>
                        </div>
                    </div>
                <?php endif;
                break;

            case 'actions':
                $view_url    = admin_url( 'post.php?post=' . $post_id . '&action=edit' );
                $trash_url   = wp_nonce_url( admin_url( 'post.php?post=' . $post_id . '&action=trash' ), 'trash-post_' . $post_id );
                $pricing_url = 'https://wpmet.com/plugin/metform/pricing/';

                $view_icon     = '<svg width="20" height="20" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M14.3628 7.36325C14.5655 7.64745 14.6668 7.78959 14.6668 7.99992C14.6668 8.21025 14.5655 8.35239 14.3628 8.63659C13.4521 9.91365 11.1263 12.6666 8.00016 12.6666C4.87402 12.6666 2.54823 9.91365 1.63752 8.63659C1.43484 8.35239 1.3335 8.21025 1.3335 7.99992C1.3335 7.78959 1.43484 7.64745 1.63752 7.36325C2.54823 6.08621 4.87402 3.33325 8.00016 3.33325C11.1263 3.33325 13.4521 6.08621 14.3628 7.36325Z" stroke="#585960" stroke-width="1.2"/><path d="M10 8C10 6.8954 9.1046 6 8 6C6.8954 6 6 6.8954 6 8C6 9.1046 6.8954 10 8 10C9.1046 10 10 9.1046 10 8Z" stroke="#585960" stroke-width="1.2"/></svg>';
                $download_icon = '<svg width="20" height="20" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M1.99951 11.3335C1.99951 11.9535 1.99951 12.2635 2.06766 12.5178C2.2526 13.208 2.79169 13.7471 3.48188 13.932C3.73621 14.0002 4.0462 14.0002 4.66618 14.0002H11.3329C11.9529 14.0002 12.2629 14.0002 12.5172 13.932C13.2073 13.7471 13.7465 13.208 13.9314 12.5178C13.9995 12.2635 13.9995 11.9535 13.9995 11.3335" stroke="#585960" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/><path d="M11 7.66669C11 7.66669 8.79056 10.6667 7.99996 10.6667C7.20943 10.6667 5 7.66669 5 7.66669M7.99996 10V2" stroke="#585960" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
                $trash_icon    = '<svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M15 5.66675L14.4093 15.4141C14.3666 16.1178 13.7834 16.6667 13.0783 16.6667H6.92164C6.21659 16.6667 5.6334 16.1178 5.59075 15.4141L5 5.66675" stroke="#A32D2D" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/><path d="M4 5.66659H7.33333M7.33333 5.66659L8.16017 3.73731C8.26522 3.49219 8.50625 3.33325 8.77293 3.33325H11.2271C11.4937 3.33325 11.7348 3.49219 11.8398 3.73731L12.6667 5.66659M7.33333 5.66659H12.6667M16 5.66659H12.6667" stroke="#A32D2D" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/><path d="M8.3335 13V9" stroke="#A32D2D" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/><path d="M11.6665 13V9" stroke="#A32D2D" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
                $lock_icon     = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 13 14" fill="none"><path d="M10.225 6.025h-8.4a1.2 1.2 0 0 0-1.2 1.2v4.2a1.2 1.2 0 0 0 1.2 1.2h8.4a1.2 1.2 0 0 0 1.2-1.2v-4.2a1.2 1.2 0 0 0-1.2-1.2m-7.2 0v-2.4a3 3 0 1 1 6 0v2.4" stroke="#2271B1" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round"/></svg>';

                $output  = '<div class="mf-entry-actions">';
                $output .= '<a href="' . esc_url( $view_url ) . '" class="mf-entry-action-btn mf-entry-action-view" data-mf-tooltip="' . esc_attr__( 'View', 'metform' ) . '">' . $view_icon . '</a>';

                if ( class_exists( '\MetForm_Pro\Plugin' ) ) {
                    $output .= '<button type="button" class="mf-entry-action-btn mf-entry-action-download metform-pdf-export-btn" data-id="' . esc_attr( $post_id ) . '" data-nonce="' . esc_attr( wp_create_nonce( 'metform-pdf-export' ) ) . '" data-rest-api="' . esc_url( $entry_api ) . '=' . esc_attr( $post_id ) . '" data-mf-tooltip="' . esc_attr__( 'Export PDF', 'metform' ) . '">' . $download_icon . '</button>';
                } else {
                    $output .= '<a href="' . esc_url( $pricing_url ) . '" target="_blank" rel="noopener" class="mf-entry-action-btn mf-entry-action-locked" data-mf-tooltip="' . esc_attr__( 'Export PDF is a premium feature. Upgrade for premium acess', 'metform' ) . '">' . $lock_icon . '</a>';
                }

                $output .= '<a href="' . esc_url( $trash_url ) . '" class="mf-entry-action-btn mf-entry-action-trash" data-mf-tooltip="' . esc_attr__( 'Move to Trash', 'metform' ) . '" onclick="return confirm(\'' . esc_js( __( 'Move this entry to trash?', 'metform' ) ) . '\')">' . $trash_icon . '</a>';
                $output .= '</div>';
                \MetForm\Utils\Util::metform_content_renderer( $output );
                break;
        }
    }

    public function remove_row_actions( $actions, $post ) {
        if ( isset( $post->post_type ) && $post->post_type === 'metform-entry' ) {
            return [];
        }
        return $actions;
    }

    public function query_filter($query)
    {
        global $pagenow;
        //phpcs:ignore WordPress.Security.NonceVerification -- Ignore because of This is CPT page
        $current_page = isset($_GET['post_type']) ? sanitize_key($_GET['post_type']) : '';
        if (
            is_admin()
            && 'metform-entry' == $current_page
            && 'edit.php' == $pagenow
            && $query->query_vars['post_type'] == 'metform-entry'
            && isset($_GET['mf_form_id']) //phpcs:ignore WordPress.Security.NonceVerification
            && $_GET['mf_form_id'] != 'all' //phpcs:ignore WordPress.Security.NonceVerification
        ) {

            $form_id = sanitize_key($_GET['mf_form_id']); //phpcs:ignore WordPress.Security.NonceVerification
            $query->query_vars['meta_key'] = 'metform_entries__form_id';
            $query->query_vars['meta_value'] = $form_id;
            $query->query_vars['meta_compare'] = '=';
        }

        if (
            is_admin()
            && 'metform-entry' == $current_page
            && 'edit.php' == $pagenow
            && $query->query_vars['post_type'] == 'metform-entry'
            && isset($_GET['mf_ref_id']) //phpcs:ignore WordPress.Security.NonceVerification
            && $_GET['mf_ref_id'] != 'all' //phpcs:ignore WordPress.Security.NonceVerification
        ) {

            $page_id = sanitize_key($_GET['mf_ref_id']); //phpcs:ignore WordPress.Security.NonceVerification
            $query->query_vars['meta_key'] = 'mf_page_id';
            $query->query_vars['meta_value'] = $page_id;
            $query->query_vars['meta_compare'] = '=';
        }
    }

    public function wp_mail_from($name)
    {
        return get_bloginfo('name');
    }

    /**
     * Metform Additional Upload Mimes
     * 
     * @since 3.8.9
     * @access public
     * @param array $mimes
     * @return array
     */
    public function metfom_additional_upload_mimes( $mimes )
    {
        
        $mimes['stl'] = 'application/octet-stream';
        $mimes['psd'] = 'image/vnd.adobe.photoshop';
        $mimes['stp'] = 'text/plain; charset=us-ascii';

        return $mimes;
    }

    /**
     * Delete uploaded files when entry is deleted
     * 
     * @since 4.1.3
     * @param int $post_id
     * @param object $post
     */
    public function delete_entry_files($post_id, $post)
    {
        // Only process metform entries
        if (!isset($post->post_type) || $post->post_type !== 'metform-entry') {
            return;
        }

        // Check if entry has any uploaded files first
        $has_files = get_post_meta($post_id, 'metform_entries__file_upload_new', true) || get_post_meta($post_id, 'metform_entries__file_upload', true);
        
        if (empty($has_files)) {
            return; // No files uploaded in this entry, skip deletion
        }

        // Get upload directory info
        $upload_dir = wp_upload_dir();
        
        // Process both old and new file metadata formats
        $file_metas = [
            get_post_meta($post_id, 'metform_entries__file_upload_new', true),
            get_post_meta($post_id, 'metform_entries__file_upload', true)
        ];

        foreach ($file_metas as $file_meta) {
            if (!is_array($file_meta)) continue;
            
            foreach ($file_meta as $files) {
                if (!is_array($files)) {
                    $files = [$files]; // Handle single file
                }
                
                foreach ($files as $file) {
                    if (!is_array($file)) continue;
                    
                    // Try stored path first
                    $file_path = isset($file['file']) ? wp_normalize_path($file['file']) : false;
                    
                    // Reconstruct from URL if path doesn't exist
                    if ((!$file_path || !file_exists($file_path)) && isset($file['url'])) {
                        $file_path = str_replace(
                            wp_normalize_path($upload_dir['baseurl']),
                            wp_normalize_path($upload_dir['basedir']),
                            wp_normalize_path($file['url'])
                        );
                    }
                    
                    // Delete file if exists
                    if ($file_path && file_exists($file_path)) {
                        @unlink($file_path);
                    }
                }
            }
        }
    }
}
