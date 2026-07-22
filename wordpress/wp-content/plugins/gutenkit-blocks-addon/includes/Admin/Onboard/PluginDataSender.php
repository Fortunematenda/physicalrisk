<?php

namespace Gutenkit\Admin\Onboard;

use Gutenkit\Admin\Onboard\Onboard;
use Gutenkit\Traits\Singleton;

defined('ABSPATH') || exit;

class PluginDataSender {
	use Singleton;

	private function getUrl() {
		return 'https://api.wpmet.com/public/plugin-subscribe/';
	}

	public function sendEmailSubscribeData( $data ) {
		return wp_remote_post(
			$this->getUrl(),
			array(
				'method'      => 'POST',
				'headers'     => array(
					'Accept'       => '*/*',
					'Content-Type' => 'application/json'
				),
				'body'        => wp_json_encode( $data ),
			)
		);
	}
}
