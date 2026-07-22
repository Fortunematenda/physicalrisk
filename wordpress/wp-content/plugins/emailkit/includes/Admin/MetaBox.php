<?php

namespace EmailKit\Admin;

use EmailKit\Admin\Emails\Helpers\Utils;
use WP_Query;

defined('ABSPATH') || exit;
/**
 * Add MetaBoxes
 */
class MetaBox
{
    /**
     * @var array
     */
    public $template_types = [];

    public function __construct()
    {
        $this->template_types = [

            "New Order"                         =>  'New Order - WC ',
            "Cancelled order"                   => 'Cancelled order  - WC ',
            "Failed Order"                      => 'Failed Order  - WC ',
            "Order On Hold"                     =>  'Order On Hold - WC ',
            "Processing Order"                  =>  'Processing Order - WC ',
            "Completed Order"                   =>  'Completed Order - WC ',
            "Refunded Order"                    =>  'Refunded Order - WC ',
            "Customer Invoice"                  =>  'Customer Invoice - WC ',
            "Customer Note"                     =>  'Customer Note - WC ',
            "Reset Password"                    =>  'Reset Password - WC ',
            "New Account"                       =>  'New Account - WC ',
        ];

        add_action('add_meta_boxes', [$this, 'add']);
        add_action('save_post', [$this, 'save']);
    }

    public function add()
    {

        add_meta_box("metaBox_id", "Email Details", [$this, 'emailTemplate'], ["emailkit"], "advanced", "high", null);
    }

    /**
     * MetaBox Template
     */
    public function emailTemplate($object)
    {

        wp_nonce_field(basename(__FILE__), "meta-box-nonce");


?>
        <div style="margin-top:20px;">
            <label for="emailkit_template_title" style="font-weight:bold"><?php esc_html_e('Email Subject', 'emailkit'); ?></label> <br><br>

            <input type="text" name="emailkit_template_title" id="emailkit_template_title" size="30" style="width:100% !important;" value="<?php echo esc_html(get_post_meta($object->ID, "emailkit_template_title", true)); ?>">
            <br> <br>

            <label for="emailkit_template_type" style="font-weight:bold"><?php esc_html_e('Email Template Types', 'emailkit'); ?></label> <br> <br>

            <select name="emailkit_template_type" id="emailkit_template_type" style="width:100% !important;">
                <option value=""><?php esc_html_e('Select Template Types', 'emailkit'); ?></option>
                <?php

                foreach ($this->template_types as $key => $template_type) {
                ?>
                    <option value="<?php echo esc_attr($key); ?>" <?php echo esc_html($key == get_post_meta($object->ID, "emailkit_template_type", true) ? 'selected' : ''); ?>>
                        <?php echo esc_attr($template_type); ?> </option>
                <?php } ?>
            </select> <br> <br>

            <label for="emailkit_template_content_html" style="font-weight:bold"><?php esc_html_e('Email Template HTML', 'emailkit'); ?></label> <br><br>

            <textarea readonly class="email_template_html" rows="10" cols="50" name="emailkit_template_content_html" style="width:100% !important;"><?php echo esc_html(get_post_meta($object->ID, "emailkit_template_content_html", true)); ?></textarea>
            <br> <br>
            <button class="emailkit--open-editor button button-primary button-large"><?php esc_html_e('Edit Email Template', 'emailkit'); ?></button>
            <br> <br>

            <input type="hidden" name="post_for_update" id="post_for_update" value="<?php echo isset($object->ID) ? esc_attr($object->ID) : ''; ?>">
            <label for="emailkit_template_content_object" style="font-weight:bold"><?php esc_html_e('Email Template Object', 'emailkit'); ?></label> <br><br>

            <textarea readonly class="email-template-object" rows="5" cols="20" name="emailkit_template_content_object" style="width:100% !important;"><?php echo esc_html(get_post_meta($object->ID, "emailkit_template_content_object", true)); ?></textarea>
            <br> <br>

            <div class="flex-row-x">
                <label class="subtitile" for="emailkit_template_status" style="font-weight:bold"><?php esc_html_e('Status(Active/Inactive):', 'emailkit'); ?> </label>

                <?php
                $status = esc_html(get_post_meta($object->ID, "emailkit_template_status", 'Active'));
                $checked_on = $status == 'Active' ? "checked" : "";
                $toggle_label = $status == 'Active' ? "Active" : "Inactive";
                $status_value = $status == 'Active' ? "active" : "inactive";
                ?>

                <div class="toggle-switch">
                    <input name="emailkit_template_status" type="checkbox" id="toggle-switch" <?php echo esc_attr($checked_on); ?>>
                    <label for="toggle-switch"></label>
                </div>

                <input type="hidden" name="emailkit_template_status_value" value="<?php echo esc_attr($status_value); ?>">

                <span id="toggle-label"><?php echo esc_html($toggle_label); ?></span>

            </div>
            <style>
                .flex-row-x {
                    display: flex;
                    align-items: center;
                }

                .toggle-switch {
                    position: relative;
                    display: inline-block;
                    width: 60px;
                }

                .postbox-header .hndle.ui-sortable-handle {
                    font-size: 1.1rem !important;
                }
                #post-body #post-body-content {

                    margin-bottom: 0 !important;
                }

                .inside label,
                .subtitile {
                    font-size: 15px;
                }

                .toggle-switch input[type="checkbox"] {
                    opacity: 0;
                    width: 0;
                    height: 0;
                }

                .toggle-switch label {
                    position: absolute;
                    top: -1px;
                    left: 10px;
                    right: 0;
                    bottom: 0;
                    height: 22px;
                    width: 50px;
                    background-color: #ccc;
                    border-radius: 34px;
                    cursor: pointer;
                }

                .toggle-switch label:before {
                    position: absolute;
                    top: 4px;
                    content: "";
                    height: 15px;
                    width: 15px;
                    left: 4px;
                    bottom: 4px;
                    background-color: white;
                    border-radius: 50%;
                    transition: all 0.2s;
                }

                .toggle-switch input[type="checkbox"]:checked+label {
                    background-color: #2196F3;
                }

                .toggle-switch input[type="checkbox"]:checked+label:before {
                    transform: translateX(26px);
                }

                #toggle-label {
                    margin-left: 10px;
                    font-weight: bold;
                }
            </style>

            <script>
                var toggleSwitch = document.querySelector('input[name="emailkit_template_status"]');
                var toggleLabel = document.querySelector('#toggle-label');

                toggleSwitch.addEventListener('change', function() {
                    toggleLabel.textContent = this.checked ? "Active" : "Inactive";
                });
            </script>
        </div>
        <style>
            #emailkit-fullscreen-overlay {
                position: fixed;
                width: 100%;
                height: 100%;
                background-color: #ffffff;
                top: 0;
                left: 0;
                z-index: 999999;
            }

            .emailkit-overlay-close-btn {
                position: absolute;
                right: 20px;
                top: 10px;
            }
        </style>
        <script>
           
           
           if (localStorage.getItem('editorState')) {
                localStorage.removeItem('editorState');
            }
            var url = new URL(location.href);


            if (localStorage.getItem('emailkit_template_title') && (url.searchParams.get('post') == localStorage.getItem('post_for_update')) ) {
                document.getElementById("emailkit_template_title").value = localStorage.getItem('emailkit_template_title');
            }

            if (localStorage.getItem('emailkit_template_type') && (url.searchParams.get('post') == localStorage.getItem('post_for_update'))) {
               document.getElementById("emailkit_template_type").value =  localStorage.getItem('emailkit_template_type');
            }
           
            document.querySelector('#publish').addEventListener('click', e => {
                
                
                if (localStorage.getItem('emailkit_template_title')) {
                    localStorage.removeItem('emailkit_template_title');
                }
                if (localStorage.getItem('emailkit_template_type')) {
                    localStorage.removeItem('emailkit_template_type');
                }
                if (localStorage.getItem('post_for_update')) {
                    localStorage.removeItem('post_for_update');
                }
            });
       
           
            document.querySelector('.emailkit--open-editor').addEventListener('click', e => {
            
                e.preventDefault();
                
                if (localStorage.getItem('emailkit_template_title')) {
                    localStorage.removeItem('emailkit_template_title');
                }
                if (localStorage.getItem('emailkit_template_type')) {
                    localStorage.removeItem('emailkit_template_type');
                }
                if (localStorage.getItem('post_for_update')) {
                    localStorage.removeItem('post_for_update');
                }

                localStorage.setItem('emailkit_template_title',document.getElementById("emailkit_template_title").value)
                localStorage.setItem('emailkit_template_type',document.getElementById("emailkit_template_type").value)
                localStorage.setItem('post_for_update',document.getElementById("post_for_update")?.value)

                var newActionValue = 'emailkit-builder';

                 // Set 'post_id' parameter
                 url.searchParams.set('post', document.getElementById("post_for_update")?.value);
                
                // Update or add 'action' parameter
                url.searchParams.set('action', newActionValue);

                // Replace 'post-new.php' with 'post.php' in the URL
                url.pathname = url.pathname.replace('post-new.php', 'post.php');
                            
                location.href = url.toString();
            });

        </script>
<?php
    }

    /**
     * Save metaBox values
     */
    public function save($post_id)
    {

        // We have Verified The nonce
        if (!isset($_POST['meta-box-nonce']) || !wp_verify_nonce(sanitize_text_field(wp_unslash($_POST['meta-box-nonce'])), basename(__FILE__))) {
            return;
        }

        // Check for permission
        if (!is_user_logged_in() || !current_user_can('administrator')) {
            return $post_id;
        }

        // We have Verified The nonce
        if (isset($_POST['post_for_update']) && '' != $_POST['post_for_update']) {
            $post_id = sanitize_text_field(wp_unslash($_POST['post_for_update']));
        }

        if (isset($_POST['emailkit_template_title'])) {
            update_post_meta($post_id, 'emailkit_template_title', sanitize_text_field(wp_unslash($_POST['emailkit_template_title'])));
        }

        $emailkit_template_type = isset($_POST['emailkit_template_type']) ? sanitize_text_field(wp_unslash($_POST['emailkit_template_type'])) : '';
        if (isset($_POST['emailkit_template_type']) && isset($this->template_types[$emailkit_template_type])) {

            update_post_meta($post_id, 'emailkit_template_type', $emailkit_template_type);
        }

        if (isset($_POST['emailkit_template_content_html'])) {

            $template_html =  sanitize_post( wp_unslash($_POST['emailkit_template_content_html']), 'raw');
            update_post_meta($post_id, 'emailkit_template_content_html', $template_html);
        }

        if (isset($_POST['emailkit_template_content_object'])) {
            $template_obj =   sanitize_text_field(wp_unslash($_POST['emailkit_template_content_object']));
            update_post_meta($post_id, 'emailkit_template_content_object', $template_obj);
        }


        if (isset($_POST["emailkit_template_status"])) {
            $type =  sanitize_text_field(wp_unslash($_POST['emailkit_template_type']));
            $this->deactivateTemplateTypes($type);
            update_post_meta($post_id, 'emailkit_template_status', 'Active');
        } else {
            update_post_meta($post_id, 'emailkit_template_status', 'Inactive');
        }

        global $wpdb;

        $new_title = sanitize_text_field(wp_unslash($_POST['emailkit_template_title']));

        $wpdb->update(
            $wpdb->posts,
            array('post_title' => $new_title),
            array('ID' => $post_id),
            array('%s'),
            array('%d')
        );
    }
    public function deactivateTemplateTypes($type)
    {

        $query = array(
            'post_type' => 'emailkit',
            'meta_query' => array(
                array(
                    'key' => 'emailkit_template_type',
                    'value' => $type,
                    'compare' => '=',
                ),
                array(
                    'key' => 'emailkit_template_status',
                    'value' => 'Active',
                    'compare' => '=',
                ),
                'relation' => 'AND',
                'fields' => 'ids'
            )
        );

        $data = new \WP_Query($query);
        if (isset($data)) {
            $postsIds = wp_list_pluck($data->posts, 'ID');
            foreach ($postsIds as $id) {
                update_post_meta($id, 'emailkit_template_status', 'Inactive');
            }
        }
    }
}