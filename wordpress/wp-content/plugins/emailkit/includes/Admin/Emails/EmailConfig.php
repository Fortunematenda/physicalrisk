<?php 
namespace EmailKit\Admin\Emails;

defined('ABSPATH') || exit;

class EmailConfig {


	public function __construct()
	{
		add_action('phpmailer_init',[$this,'mailtrap']);
	}

    function mailtrap($phpmailer) {
        $phpmailer->isSMTP();
        $phpmailer->Host = 'smtp.mailtrap.io';
        $phpmailer->SMTPAuth = true;
        $phpmailer->Port = 2525;
        $phpmailer->Username = '4ac3b0a2b01d7f';
        $phpmailer->Password = '5925295eee0f8a';
    }

    
}