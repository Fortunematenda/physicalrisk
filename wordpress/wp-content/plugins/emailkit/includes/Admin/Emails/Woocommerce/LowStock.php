<?php 

namespace EmailKit\Admin\Emails\Woocommerce;
use WP_Query;
use EmailKit\Admin\Emails\EmailLists;
use EmailKit\Admin\Emails\Helpers\Utils;

defined( 'ABSPATH' ) || exit;



class LowStock  {

	private $db_query_class = null;

	public function __construct() {

		$args = [
			'post_type'  => 'emailkit',
			'meta_query' => [
				[
					'key'   => 'emailkit_template_type',
					'value' => EmailLists::LOW_STOCK,
				],
				[
					'key'   => 'emailkit_template_status',
					'value' => 'Active',
				],
			],
		];

		$this->db_query_class = new WP_Query($args);

		if (isset($this->db_query_class->posts[0])) {
			add_action('woocommerce_email', [$this, 'remove_woocommerce_emails']);
		}

		add_filter('woocommerce_low_stock_notification', [$this, 'stockNotification'], 10, 1);
	}

	public function remove_woocommerce_emails($email_class)
	{

		remove_action('woocommerce_low_stock_notification', array($email_class, 'low_stock'));
	}

	public function stockNotification($product)
	{


		$query = $this->db_query_class;
		$email = get_option('admin_email');
		if (isset($query->posts[0])) {
			$html  = get_post_meta($query->posts[0]->ID, 'emailkit_template_content_html', true);
			$tbody = substr($html, strpos($html, '<tbody'));
			$row   = strpos($tbody, '</tbody>');
			$rows = '';
			$html = str_replace($row, $rows, $html);

			// Stock details array for email
			$details = Utils::woocommerce_stock_email_contents($product);


			$message  = str_replace(array_keys($details), array_values($details), apply_filters('emailkit_shortcode_filter', $html));
			$to =  get_option('admin_email');
			
			$pre_header_template = get_post_meta($query->posts[0]->ID, 'emailkit_email_preheader', true);
			$pre_header = str_replace(array_keys(Utils::transform_details_keys($details)), array_values(Utils::transform_details_keys($details)), $pre_header_template);
			$pre_header = !empty($pre_header) ? $pre_header :  esc_html__(' Low Stock Amount', 'emailkit');
			$subject_template = get_post_meta($query->posts[0]->ID, 'emailkit_email_subject', true);
      		$subject = str_replace(array_keys(Utils::transform_details_keys($details)), array_values(Utils::transform_details_keys($details)), $subject_template);
			$subject = !empty($subject) ? $subject . ' - ' . $pre_header : $product->get_name()." - ". esc_html__(' Low Stock Alert - Take Action Now!', 'emailkit') . ' - ' . $pre_header;
			


			$headers = [
				'From: ' . $email . "\r\n",
				'Reply-To: ' . $email . "\r\n",
				'Content-Type: text/html; charset=UTF-8',
			];

			wp_mail($to, $subject, $message, $headers);
		}
	}
}