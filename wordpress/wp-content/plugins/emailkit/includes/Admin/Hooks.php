<?php 

namespace Emailkit\Admin;
use EmailKit\Admin\Emails\Helpers\Utils;
use EmailKit\Admin\Emails\EmailLists;

defined("ABSPATH") || exit;

class Hooks
{

    public function __construct()
    {
        add_filter('manage_emailkit_posts_columns', [$this, 'set_columns']);
        add_action('manage_emailkit_posts_custom_column', [$this, 'add_column_content'], 10, 2);
        add_action('admin_init', [$this, 'add_author_support'], 10);
        add_action('admin_footer', [$this, 'modal_view']);
        add_filter('emailkit_shortcode_filter', [$this, 'replace']);
        add_filter('post_row_actions', [$this, 'custom_post_row_actions'], 10, 2);
        add_filter('emailkit_shortcode_filter', [$this, 'mail_shortcode_replace'], 10, 1);
    }
    function custom_post_row_actions($actions, $post) {
   
         // Remove the Quick Edit link
        if ($post->post_type === 'emailkit' && isset( $actions['inline hide-if-no-js'] ) && !class_exists('EmailKit_Essentials') ) {
            unset( $actions['inline hide-if-no-js'] );
        }


        if ($post->post_type === 'emailkit') {
            $edit_url = admin_url("post.php?post={$post->ID}&action=emailkit-builder");
            $actions['emailkit-builder'] = sprintf("<a href='%s'>%s</a>",esc_url($edit_url),esc_html__('Edit with Emailkit', 'emailkit'));
            // unset($actions['edit']);
        }
        return $actions;
    }

    public function replace($input){

        // Define the regular expression pattern
        $pattern = '/<span data-shortcode="{{([\w]+)}}">([\w]+)<\/span>/';

        // Use preg_match_all to find all matches in the input
        preg_match_all($pattern, $input, $matches, PREG_SET_ORDER);

        // Loop through each match and replace the content inside the span tag
        foreach ($matches as $match) {
            $shortcode = $match[1]; // Content inside the data-shortcode attribute

            // Create the replacement string and replace the match in the input
            $replacement = '<span data-shortcode="{{' . $shortcode . '}}">{{' . $shortcode . '}}</span>';
            $input = str_replace($match[0], $replacement, $input);
        }

        return $input;
    }
    

    public function add_author_support()
    {
        remove_post_type_support('emailkit', 'author');
        remove_post_type_support('emailkit', 'title');
    }


    public function set_columns($columns)
    {

        $date_column = $columns['date'];
        $checkbox = $columns['cb'];
        unset($columns['title']);
        unset($columns['date']);
        unset($columns['author']);
        unset($columns['cb']);

        $columns = array_merge(
            array(
                'cb'     => esc_html($checkbox),
                'title'  => esc_html__('Template Title', 'emailkit'),
                'type'   => esc_html__('Templates Type', 'emailkit'),
                'status' => esc_html__('Templates Status', 'emailkit'),
                'author' => esc_html__('Author', 'emailkit'),
                'date'   => esc_html($date_column),
               
            ),
            $columns
        );

        return $columns;
    }

    public function add_column_content($col, $post_id)
    {

        $type      = get_post_meta($post_id, 'emailkit_template_type', true);
        $status    = get_post_meta($post_id, 'emailkit_template_status', true);

        switch ($col) {
        case 'type':
            if ($col === 'type') {
                // Check for MetForm type first (starts with 'metform_form_' or equals METFORM constant)
                if (strpos($type, 'metform_form_') === 0 || $type === EmailLists::METFORM) {
                    echo esc_html__('Confirmation Mail To User', 'emailkit');
                }
                // Then check WooCommerce
                elseif (isset(EmailLists::woocommerce_email()[$type])) {
                    echo esc_html(EmailLists::woocommerce_email()[$type]);
                }
                // Then check WordPress
                elseif (isset(EmailLists::wordpress_email()[$type])) {
                    echo esc_html(EmailLists::wordpress_email()[$type]);
                }
                else {
                    echo esc_html($type);
                }
            }
            break;

            case 'status':
                $temple_type = str_replace(' ', '-', strtolower($type));
                $isStatus = $status;
                    echo wp_kses('<div class="column-content-container">', Utils::get_kses_array());
        
                    if (!empty($status)) {
                        ?>
                        <div class="emailkit-admin-template-switch">
                            <div class="emailkit-admin-template-switch-inactive">Active</div>
                            <div class="emailkit-admin-template-switch-main">
                            <div class="switch-container">
                            <label class="switch" for="emailkit-template-status-switch-<?php echo esc_attr($post_id) ?>">
                                <input type="checkbox" id="emailkit-template-status-switch-<?php echo esc_attr($post_id)?>" class="change-status-btn <?php echo esc_html($temple_type)?>" data-template-id="<?php echo esc_attr($post_id)?>" <?php echo esc_attr($status === 'active') ? 'checked' : '';?> />
                                <span class="slider"><span class="slider-active-text"></span></span>
                            </label>
                        </div>
                            </div>
                            <!-- <div class="emailkit-admin-template-switch-active <?php //echo esc_attr($isStatus=== 'active' ? 'emailkit-slider-active' : '' );?>">Enabled</div> -->
                        </div>
                        
                        <?php
                    }
        
                echo wp_kses('</div>', Utils::get_kses_array());
            break;
        }
    }

    function mail_shortcode_replace($mail_content){
        return Utils::mail_shortcode_filter($mail_content);
    }
    public function modal_view(){

        $screen = get_current_screen();

        if($screen->id == 'edit-emailkit' ){

            include_once EMAILKIT_DIR . 'includes/views/modal-add-new-email.php';
            include_once EMAILKIT_DIR . 'includes/views/modal-editor.php';
        }
    }
}