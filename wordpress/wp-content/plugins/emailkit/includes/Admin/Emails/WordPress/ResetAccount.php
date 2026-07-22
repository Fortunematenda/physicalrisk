<?php 

namespace EmailKit\Admin\Emails\WordPress;

use WP_Query;
use EmailKit\Admin\Emails\EmailLists;
use EmailKit\Admin\Emails\Helpers\Utils;
defined( 'ABSPATH' ) || exit;

class ResetAccount {
    
	private $db_query_class = null;
	public function __construct() {

		$args = array(
			'post_type'  => 'emailkit',
			'meta_query' => array(
				array(
					'key'     => 'emailkit_template_type',
					'value'   => EmailLists::WP_RESET_PASSWORD,
				),
				array(
					'key'     => 'emailkit_template_status',
					'value'   => 'Active',
				),
			),
		);

		$this->db_query_class = new WP_Query($args);
		
		if (isset($this->db_query_class->posts[0])) {

            add_filter('retrieve_password_message', [$this, 'resetPasswordMail'], 10, 4);
        }
	}


	public function resetPasswordMail($message, $key, $user_login, $user_data) {

		$query = $this->db_query_class;

        if (isset($query->posts[0])) {
            $site_name = get_bloginfo('name'); // Site Name
            $username = $user_login; // Username
            $reset_link = network_site_url("wp-login.php?action=rp&key=$key&login=" . rawurlencode($user_login), 'login'); // Reset Link

            $details = [
                "{{site_name}}"    => $site_name,
                "{{user_name}}"     => $username,
                "{{reset_link}}"   => $reset_link,
                "{{display_name}}" => $user_data->display_name,
                "{{user_url}}"     => $user_data->user_url,
                "{{user_email}}"   => $user_data->user_email,
            ];

            $email = get_option('admin_email');
            $to = $user_data->user_email;
            $reset_message = str_replace(array_keys($details), array_values($details), apply_filters('emailkit_shortcode_filter', get_post_meta($query->posts[0]->ID, 'emailkit_template_content_html', true)));

            
            $pre_header_template = get_post_meta($query->posts[0]->ID, 'emailkit_email_preheader', true);
			$pre_header = str_replace(array_keys(Utils::transform_details_keys($details)), array_values(Utils::transform_details_keys($details)), $pre_header_template);
            $pre_header = !empty($pre_header) ? $pre_header : esc_html__('reset your account', 'emailkit');
            $subject_template = get_post_meta($query->posts[0]->ID, 'emailkit_email_subject', true);
            $subject = str_replace(array_keys(Utils::transform_details_keys($details)), array_values(Utils::transform_details_keys($details)), $subject_template);
            $subject = !empty($subject) ? $subject . ' - ' . $pre_header : esc_html__('Password Reset Request for ', 'emailkit') . $site_name . ' - ' . $pre_header;

           

            $headers = [
                'From: ' . $email . "\r\n",
                'Reply-To: ' . $email . "\r\n",
                'Content-Type: text/html; charset=UTF-8',
            ];

            wp_mail($to, $subject, $reset_message, $headers);
        } else {
            // If the custom "Reset Account" template is not active, use default WordPress reset password email.
            return $message;
        }
	}
}