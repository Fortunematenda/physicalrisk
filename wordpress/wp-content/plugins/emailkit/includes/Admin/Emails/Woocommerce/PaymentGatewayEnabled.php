<?php

namespace EmailKit\Admin\Emails\Woocommerce;

use WP_Query;
use EmailKit\Admin\Emails\EmailLists;
use EmailKit\Admin\Emails\Helpers\Utils;

defined('ABSPATH') || exit;

class PaymentGatewayEnabled
{
	private $db_query_class = null;

	public function __construct()
	{
		$args = [
			'post_type'  => 'emailkit',
			'meta_query' => [
				[
					'key'   => 'emailkit_template_type',
					'value' => EmailLists::PAYMENT_GATEWAY_ENABLED,
				],
				[
					'key'   => 'emailkit_template_status',
					'value' => 'Active',
				],
			],
		];

		$this->db_query_class = new WP_Query($args);

		if (isset($this->db_query_class->posts[0])) {
			add_filter('woocommerce_email_enabled_admin_payment_gateway_enabled', '__return_false');
		}

		add_action('woocommerce_payment_gateway_enabled_notification', [$this, 'paymentGatewayEnabledEmail'], 10, 1);
	}

	public function paymentGatewayEnabledEmail($gateway)
	{
		$query = $this->db_query_class;

		if (!isset($query->posts[0])) {
			return;
		}

		if (!is_a($gateway, 'WC_Payment_Gateway')) {
			return;
		}

		$gateway_title        = $gateway->get_method_title();
		$gateway_settings_url = esc_url_raw(
			admin_url('admin.php?page=wc-settings&tab=checkout&section=' . $gateway->id)
		);
		$admin_email = get_option('admin_email');
		$user        = get_user_by('email', $admin_email);
		$username    = $user ? $user->user_login : $admin_email;

		$html  = get_post_meta($query->posts[0]->ID, 'emailkit_template_content_html', true);
		$tbody = substr($html, strpos($html, '<tbody'));
		$row   = strpos($tbody, '</tbody>');
		$rows  = '';
		$html  = str_replace($row, $rows, $html);

		$details = [
			'{{gateway_title}}'        => $gateway_title,
			'{{gateway_settings_url}}' => $gateway_settings_url,
			'{{username}}'             => $username,
			'{{admin_email}}'          => $admin_email,
			'{{app_name}}'             => get_bloginfo('name'),
			'{{site_url}}'             => get_site_url(),
		];

		$message = str_replace(array_keys($details), array_values($details), apply_filters('emailkit_shortcode_filter', $html));

		$email_settings = get_option('woocommerce_admin_payment_gateway_enabled_settings', []);
		$to = !empty($email_settings['recipient']) ? explode(',', $email_settings['recipient']) : [$admin_email];
		$to = array_map('trim', $to);

		$pre_header_template = get_post_meta($query->posts[0]->ID, 'emailkit_email_preheader', true);
		$pre_header = str_replace(
			array_keys(Utils::transform_details_keys($details)),
			array_values(Utils::transform_details_keys($details)),
			$pre_header_template
		);
		$pre_header = !empty($pre_header) ? $pre_header : esc_html__('Payment gateway enabled', 'emailkit');

		$subject_template = get_post_meta($query->posts[0]->ID, 'emailkit_email_subject', true);
		$subject = str_replace(
			array_keys(Utils::transform_details_keys($details)),
			array_values(Utils::transform_details_keys($details)),
			$subject_template
		);
		$subject = !empty($subject) ? $subject . ' - ' . $pre_header :
			/* translators: 1: site name, 2: payment gateway title */
			sprintf('[%1$s] Payment gateway "%2$s" enabled', get_bloginfo('name'), $gateway_title);

		$headers = [
			'From: ' . $admin_email . "\r\n",
			'Reply-To: ' . $admin_email . "\r\n",
			'Content-Type: text/html; charset=UTF-8',
		];

		wp_mail($to, $subject, $message, $headers);
	}
}
