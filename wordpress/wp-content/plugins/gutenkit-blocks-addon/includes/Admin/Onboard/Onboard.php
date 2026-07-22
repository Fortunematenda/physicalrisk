<?php

namespace Gutenkit\Admin\Onboard;

class Onboard
{
	const STATUS            = 'gutenkit_onboard_status';
	const EMAIL             = 'gutenkit_onboard_email';
	const EMAIL_ID          = 'gutenkit_onboard_email_id';

	/**
	 * @param $data
	 */
	public function submit($data)
	{
		if (!empty($data)) {
			if (!empty($data['userMail']) && !empty(is_email($data['userMail']))) {
				$args = [
					'email'  => sanitize_email( wp_unslash( $data['userMail'] ) ),
					'slug'   => 'gutenkit-blocks-addon',
				];

				\Gutenkit\Admin\Onboard\PluginDataSender::instance()->sendEmailSubscribeData($args);

				update_option(Onboard::EMAIL, 'subscribed');
				update_option(Onboard::EMAIL_ID, $data['userMail']);
			}

			update_option(Onboard::STATUS, 'onboarded');
		}

		return [
			'status'  => 'success',
			'message' => __('Onboard data saved successfully.', 'gutenkit-blocks-addon')
		];
	}
}
