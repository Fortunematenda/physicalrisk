<?php

namespace ShopEngine\Modules\Wishlist;

use ShopEngine\Base\Api;

class Route extends Api {

	public function config() {

		$this->prefix = 'wishlist';
		$this->param  = "";
		$this->customer_only = true;
	}

	public function post_add_to_list() {

		// Verify nonce for CSRF protection
		$nonce = $this->request->get_header('X-WP-Nonce');
		if (empty($nonce) || !wp_verify_nonce($nonce, 'wp_rest')) {
			return new \WP_Error('rest_forbidden', esc_html__('Invalid nonce.', 'shopengine'), array('status' => 403));
		}

		$data = $this->request->get_params();
		$idd = $data['product_id'];

		if(empty($idd)) {

			return [
				'status' => 'failed',
				'message' => esc_html__('Product id not found.', 'shopengine'),
			];
		}

		if(is_user_logged_in()) {

			$uid = get_current_user_id();

			$content = get_user_meta( $uid, Wishlist::UMK_WISHLIST, true );
			$content = empty($content) ? [] : $content;

			if(isset($content[$idd])) {

				$msg = esc_html__('Successfully removed from wishlist', 'shopengine');
				$action = 'removed';
				unset($content[$idd]);

			} else {

				$msg = esc_html__('Successfully added into wishlist', 'shopengine');
				$action = 'add';
				$content[$idd] = $idd;
			}

			update_user_meta( $uid, Wishlist::UMK_WISHLIST, $content );

			return [
				'status' => 'success',
				'message' => $msg,
				'todo' => $action,
			];
		}

		$cck = empty($_COOKIE[Wishlist::COOKIE_KEY]) ? '' : sanitize_text_field(wp_unslash($_COOKIE[Wishlist::COOKIE_KEY]));
		$cck = explode(',', $cck);
		$content = array_combine($cck, $cck);

		if(isset($content[$idd])) {

			$msg = esc_html__('Successfully removed from wishlist', 'shopengine');
			$action = 'removed';
			unset($content[$idd]);

		} else {

			$msg = esc_html__('Successfully added into wishlist', 'shopengine');
			$action = 'add';
			$content[$idd] = $idd;
		}

		$val = implode(',', $content);

		setcookie(Wishlist::COOKIE_KEY, $val, strtotime( '+30 days'), '/' );

		return [
			'status' => 'success',
			'message' => $msg,
			'dd' => Wishlist::COOKIE_KEY,
			'todo' => $action,
		];
	}
}
