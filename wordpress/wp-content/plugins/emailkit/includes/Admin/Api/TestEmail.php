<?php 

namespace EmailKit\Admin\Api;

defined( 'ABSPATH' ) || exit;

class TestEmail {
	
	public $prefix = '';
    public $param = '';
    public $request = null;
	public function __construct() {
		
		add_action('rest_api_init', function () {
            register_rest_route('emailkit/v1', 'send-test-email', array(
                'methods'  => \WP_REST_Server::ALLMETHODS,
                'callback' => [$this, 'sendEmail'],
                'permission_callback' => '__return_true',
            ));
        });
	}

	public function sendEmail($request)
    {
		if (!wp_verify_nonce($request->get_header('X-WP-Nonce'), 'wp_rest')) {
            return [
                'status'    => 'fail',
                'message'   => [__('Nonce mismatch.', 'emailkit')]
            ];
        }

        if (!is_user_logged_in() || !current_user_can('manage_options')) {
            return [
                'status'    => 'fail',
                'message'   => [ __('Access denied.', 'emailkit')]
            ];
        }
        
        $post_id    = $request->get_param('post_id');
        $from       = get_option('admin_email');
        $to         = $request->get_param('email');

        $pre_header = get_post_meta($post_id, 'emailkit_email_preheader', true);
        $pre_header = !empty($pre_header) ? $pre_header : esc_html__('This is a test email.', 'emailkit');
        $subject    = get_post_meta($post_id, 'emailkit_email_subject', true);
        $subject    = !empty($subject) ? $subject . ' - ' . $pre_header : $request->get_param('subject') . ' - ' . $pre_header;
        
        $message    = $request->get_param('message');
		$headers = [
			'From: ' . $from . "\r\n",
			'Reply-To: ' . $from . "\r\n",
			'Content-Type: text/html; charset=UTF-8',
		];

        $mail_error = null;
        add_action( 'wp_mail_failed', function( \WP_Error $wp_error ) use ( &$mail_error ) {
            $mail_error = $wp_error;
        } );

        $sent = wp_mail( $to, $subject, $message, $headers );

        if ( ! $sent ) {
            $error_message = __( 'Failed to send the test email. Please configure an SMTP plugin.', 'emailkit' );

            if ( $mail_error instanceof \WP_Error ) {
                $raw = $mail_error->get_error_message();

                $error_map = [
                    'Could not instantiate mail function'   => __( 'Mail server is not configured on this server. Please use an SMTP plugin.', 'emailkit' ),
                    'SMTP connect() failed'                 => __( 'Failed to connect to the SMTP server. Please check your SMTP settings.', 'emailkit' ),
                    'Failed to connect to mailserver'       => __( 'Failed to connect to the mail server. Please check your SMTP host and port.', 'emailkit' ),
                    'Could not connect to SMTP host'        => __( 'Could not connect to the SMTP host. Please verify your SMTP settings.', 'emailkit' ),
                    'SMTP Error: Could not authenticate'    => __( 'SMTP authentication failed. Please check your username and password.', 'emailkit' ),
                    'Invalid address'                       => __( 'The recipient email address is invalid. Please enter a valid email.', 'emailkit' ),
                    'Connection refused'                    => __( 'Connection to the mail server was refused. Please check your SMTP host and port.', 'emailkit' ),
                    'Connection timed out'                  => __( 'Connection to the mail server timed out. Please check your SMTP host and port.', 'emailkit' ),
                ];

                foreach ( $error_map as $keyword => $friendly_message ) {
                    if ( str_contains( $raw, $keyword ) ) {
                        $error_message = $friendly_message;
                        break;
                    }
                }
            }
        }
        

        if ($sent) {
            return [
                'status' => 'success',
                'message' => [ __( 'Test email sent successfully.', 'emailkit' ) ],
            ];
        } else {
            return [
                'status' => 'fail',
                'message' => [ esc_html( $error_message) ],
            ];
        }
    }
}