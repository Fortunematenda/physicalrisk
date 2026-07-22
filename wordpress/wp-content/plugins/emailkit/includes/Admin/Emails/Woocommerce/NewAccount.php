<?php 

namespace EmailKit\Admin\Emails\Woocommerce;

use WP_Query;
use WP_User;
use EmailKit\Admin\Emails\EmailLists;
use EmailKit\Admin\Emails\Helpers\Utils;

defined('ABSPATH') || exit;

class NewAccount
{
	public $user_login;
	public $user_email;
	public $user_pass;
	public $password_generated;
	public $set_password_url;
	public $recipient;
	public $object;

	private $db_query_class = null;

	public function __construct()
	{
		$args = array(
			'post_type'  => 'emailkit',
			'meta_query' => array(
				array(
					'key'   => 'emailkit_template_type',
					'value' => EmailLists::NEW_ACCOUNT,
				),
				array(
					'key'   => 'emailkit_template_status',
					'value' => 'Active',
				),
			),
		);


		$this->db_query_class = new WP_Query($args);

		if (isset($this->db_query_class->posts[0])) {

			add_filter('woocommerce_email_enabled_customer_new_account', '__return_false');
		}

		add_filter('woocommerce_created_customer_notification', [$this, 'newAccountMail'], 10, 3);
	}

	public function newAccountMail($user_id,  $user_pass = '', $password_generated = false)
	{


		$query = $this->db_query_class;
		$email = get_option('admin_email');

		if ($user_id) {
			$this->object = new WP_User($user_id);
			$this->user_pass          = $user_pass;
			$this->user_login         = stripslashes($this->object->user_login);
			$this->user_email         = stripslashes($this->object->user_email);
			$this->recipient          = $this->user_email;
			$this->password_generated = $password_generated;
			$this->set_password_url   = $this->generate_set_password_url();
		}
		if (isset($query->posts[0])) {
			$html  = get_post_meta($query->posts[0]->ID, 'emailkit_template_content_html', true);
			$tbody = substr($html, strpos($html, '<tbody'));
			$row   = strpos($tbody, '</tbody>');
			$rows = '';
			$html = str_replace($row, $rows, $html);


			$details = [
				"{{user_login}}" 		=> $this->user_login,
				"{{user_email}}" 		=> $this->user_email,
				"{{set_password_url}}" 	=> $this->set_password_url,
				"{{app_name}}"        	=> get_bloginfo('name'), // Get the blog name
				"{{site_url}}"         	=> get_site_url(),  // Get the site URL
				"{{display_name}}"     	=> $this->object->display_name,
			];
            
			$message  = str_replace(array_keys($details), array_values($details), apply_filters('emailkit_shortcode_filter', $html));

			$to      = $this->user_email;
			
			$pre_header_template = get_post_meta($query->posts[0]->ID, 'emailkit_email_preheader', true);
			$pre_header = str_replace(array_keys(Utils::transform_details_keys($details)), array_values(Utils::transform_details_keys($details)), $pre_header_template);
			$pre_header = !empty($pre_header) ? $pre_header : esc_html__("Customer registered", 'emailkit');
			$subject_template = get_post_meta($query->posts[0]->ID, 'emailkit_email_subject', true);
      		$subject = str_replace(array_keys(Utils::transform_details_keys($details)), array_values(Utils::transform_details_keys($details)), $subject_template);
			$subject = !empty($subject) ? $subject . ' - ' . $pre_header :  esc_html__("Your account has been created on ", 'emailkit') ." ". esc_attr(get_bloginfo('name')). ' - ' . $pre_header;
			
			


			$headers = [
				'From: ' . $email . "\r\n",
				'Reply-To: ' . $email . "\r\n",
				'Content-Type: text/html; charset=UTF-8',
			];

			wp_mail($to, $subject, $message, $headers);
		}
	}

	protected function generate_set_password_url()
	{
		// Generate a magic link so user can set initial password.
		$key = get_password_reset_key($this->object);
		if (!is_wp_error($key)) {
			$action                 = 'newaccount';
			return wc_get_account_endpoint_url('lost-password') . "?action=$action&key=$key&login=" . rawurlencode($this->object->user_login);
		} else {
			// Something went wrong while getting the key for new password URL, send customer to the generic password reset.
			return wc_get_account_endpoint_url('lost-password');
		}
	}
}