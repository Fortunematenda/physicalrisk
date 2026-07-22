<?php

namespace ShopEngine\Core\Onboard;

use ShopEngine\Core\Register\Model;

class Onboard
{
    const ACCOUNT_URL     = 'https://account.wpmet.com';
    const ENVIRONMENT_ID  = 3;
    const CONTACT_LIST_ID = 3;
    const STATUS          = 'shopengine_onboard_status';
    /**
     * @param $data
     */
    public function submit($data)
    {
        if (!empty($data['data'])) {
            $data = $data['data'];

            if (!empty($data['widgets'])) {
                Model::source('settings')->set_option('widgets', $data['widgets']);
            }

            if (!empty($data['modules'])) {
                Model::source('settings')->set_option('modules', $data['modules']);
            }

            if (isset($data['user_onboard_data']['isDataSharable']) && $data['user_onboard_data']['isDataSharable'] == true) {
                Plugin_Data_Sender::instance()->send('diagnostic-data');
            }

            if (!empty($data['user_onboard_data']['email']) && !empty(is_email($data['user_onboard_data']['email']))) {
                $args = [
                    'email'           => sanitize_email( wp_unslash( $data['user_onboard_data']['email'] ) ),
                    'slug'            => 'shopengine',
                ];

                $response = Plugin_Data_Sender::instance()->sendEmailSubscribeData( 'plugin-subscribe', $args );
            }
            update_option(Onboard::STATUS, true);
        }

       $response = array(
        'status'  => 'success',
        'message' => \ShopEngine\Core\Settings\Api::plugin_activate_message('setup_configurations')
    );

    $plugins = !empty($data['our_plugins']) && is_array($data['our_plugins']) ? $data['our_plugins'] : [];
    
        if($plugins) {
            $total_plugins = count($plugins);
            $total_steps   = 1 + $total_plugins;
            $percentage = ($total_steps > 0) ? (1 / $total_steps) * 100 : 100;
            $percentage = round($percentage);

            $response['progress'] = $percentage;
            $response['plugins'] = $plugins;
        }

        return $response;
    }
}
