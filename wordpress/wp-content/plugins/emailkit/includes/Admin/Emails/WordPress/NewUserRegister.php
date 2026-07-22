<?php 

namespace EmailKit\Admin\Emails\WordPress;

use WP_Query;
use EmailKit\Admin\Emails\EmailLists;
use EmailKit\Admin\Emails\Helpers\Utils;

defined( 'ABSPATH' ) || exit;

class NewUserRegister {
        
	private $db_query_class = null;

	public function __construct() {
		
        $args = array(
            'post_type'  => 'emailkit',
            'meta_query' => array(
                array(
                    'key'     => 'emailkit_template_type',
                    'value'   => EmailLists::WP_NEW_REGISTER,
                ),
                array(
                    'key'     => 'emailkit_template_status',
                    'value'   => 'Active',
                ),
            ),
        );

        $this->db_query_class = new WP_Query($args);
        if (isset($this->db_query_class->posts[0])) {

            add_filter('wp_new_user_notification_email', [$this, 'newUserMail'], 10, 3);
        }
    }


    public function newUserMail($new_user_notification_email, $user, $blogname)
    {

        $query = $this->db_query_class;
        $key = get_password_reset_key($user);

		$recipient_email = $user->user_email;

        $details = [
            "{{app_name}}"      => $blogname,
            "{{reset_url}}"     => network_site_url("wp-login.php?action=rp&key=$key&login=" . rawurlencode($user->user_login), 'login'),
            "{{display_name}}"  => $user->display_name,
            "{{user_url}}"      => $user->user_url,
            "{{user_email}}" => $recipient_email,
        ];

        $new_user_notification_email['from'] = get_option('admin_email');
        if (isset($query->posts[0])) {
            $new_user_notification_email['message'] = str_replace(array_keys($details), array_values($details),  apply_filters('emailkit_shortcode_filter', get_post_meta($query->posts[0]->ID, 'emailkit_template_content_html', true)));
        }
        
        $pre_header_template = get_post_meta($query->posts[0]->ID, 'emailkit_email_preheader', true);
		$pre_header = str_replace(array_keys(Utils::transform_details_keys($details)), array_values(Utils::transform_details_keys($details)), $pre_header_template);
        $pre_header = !empty( $pre_header) ?  $pre_header : esc_html__('user registration', 'emailkit');
        $new_user_email_template_subject = get_post_meta($query->posts[0]->ID, 'emailkit_email_subject', true);
        $new_user_notification_email['subject'] = str_replace(array_keys(Utils::transform_details_keys($details)), array_values(Utils::transform_details_keys($details)),  $new_user_email_template_subject);
        $new_user_notification_email['subject'] = !empty( $new_user_notification_email['subject']) ?  $new_user_notification_email['subject'] . ' - ' . $pre_header : esc_html__(' Welcome! New User Added to', 'emailkit') . ' ' . $blogname . ' - ' . $pre_header;

        

        $new_user_notification_email['headers'] = [
            'From: ' . $blogname . ' <' . $new_user_notification_email['from'] . "> \r\n",
            'Reply-To: <' . $new_user_notification_email['from'],
            'Content-Type: text/html; charset=UTF-8',
        ];

		$new_user_notification_email['to'] = $recipient_email;

        return $new_user_notification_email;
    }
	
}