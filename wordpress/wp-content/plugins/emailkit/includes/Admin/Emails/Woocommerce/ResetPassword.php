<?php 

namespace EmailKit\Admin\Emails\Woocommerce;

use WP_Query;
use EmailKit\Admin\Emails\EmailLists;
use EmailKit\Admin\Emails\Helpers\Utils;

defined("ABSPATH") || exit;

class ResetPassword
{

	public $user_id;
	public $user_login;
	public $user_email;
	public $reset_key;
	public $object;

	private $db_query_class = null;

	public function __construct()
	{
		$args = array(
			'post_type'  => 'emailkit',
			'meta_query' => array(
				array(
					'key'   => 'emailkit_template_type',
					'value' => EmailLists::RESET_PASSWORD,
				),
				array(
					'key'   => 'emailkit_template_status',
					'value' => 'Active',
				),
			),
		);

		$this->db_query_class = new WP_Query($args);

		if (isset($this->db_query_class->posts[0])) {
			add_action('woocommerce_email', [$this, 'remove_woocommerce_emails']);
		}

		add_filter('woocommerce_reset_password_notification', [$this, 'passwordReset'], 10, 2);
	}

	public function remove_woocommerce_emails($email_class)
	{
		remove_action('woocommerce_reset_password_notification', array($email_class->emails['WC_Email_Customer_Reset_Password'], 'trigger'));
	}

	public function passwordReset($user_login, $reset_key)
	{


		$query = $this->db_query_class;
		$email = get_option('admin_email');

		if ($user_login && $reset_key) {
			$this->object     = get_user_by('login', $user_login);
			$this->user_id    = $this->object->ID;
			$this->user_login = $user_login;
			$this->reset_key  = $reset_key;
			$this->user_email = stripslashes($this->object->user_email);
		}

		if (isset($query->posts[0])) {
			$html  = get_post_meta($query->posts[0]->ID, 'emailkit_template_content_html', true);
			$tbody = substr($html, strpos($html, '<tbody'));
			$row   = strpos($tbody, '</tbody>');
			$rows = '';
			$html = str_replace($row, $rows, $html);


			$details = [
				"{{user_login}}" => $user_login,
				"{{user_email}}" => $this->user_email,
				"{{reset_url}}" => $this->generate_set_password_url(),
				"{{site_name}}" => get_bloginfo('name'),
				"{{site_url}}" => get_site_url(),
				"{{display_name}}" => $this->object->display_name,
			];

			$message  = str_replace(array_keys($details), array_values($details), apply_filters('emailkit_shortcode_filter', $html));
			$to       =  $this->user_email;
		
			$pre_header_template = get_post_meta($query->posts[0]->ID, 'emailkit_email_preheader', true);
			$pre_header = str_replace(array_keys(Utils::transform_details_keys($details)), array_values(Utils::transform_details_keys($details)), $pre_header_template);
			$pre_header = !empty($pre_header) ? $pre_header : esc_html__( "password reset requested", "emailkit");
			$subject_template = get_post_meta($query->posts[0]->ID, 'emailkit_email_subject', true);
      		$subject = str_replace(array_keys(Utils::transform_details_keys($details)), array_values(Utils::transform_details_keys($details)), $subject_template);
			$subject = !empty($subject) ? $subject . ' - ' . $pre_header : esc_html__("Hi ", "emailkit")  . esc_attr($user_login) ." ". esc_html__( "Your password reset requested on ", "emailkit") . "" . esc_attr(get_bloginfo('name')) . ' - ' . $pre_header;
			

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
			$action = 'newaccount';
			$reset_url = wc_get_account_endpoint_url('lost-password') . "?action=$action&key=$key&login=" . rawurlencode($this->object->user_login) . "&show-reset-form=true";

			return $reset_url;
		} else {
			// Something went wrong while getting the key for a new password URL,
			// send the customer to the generic password reset.
			return wc_get_account_endpoint_url('lost-password') . '?show-reset-form=true&action';
		}
	}
}