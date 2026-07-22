<?php 
namespace ElementsKit_Lite\Libs\Pro_Label;

defined( 'ABSPATH' ) || exit;

trait Admin_Notice {

	public function footer_alert_box() {
		include 'views/modal.php';
	}

	public function show_go_pro_notice() {

		\Oxaim\Libs\Notice::instance( 'elementskit-lite', 'go-pro-noti2ce' )
		->set_dismiss( 'global', ( 3600 * 24 * 300 ) )
		->set_type( 'warning' )
		->set_html(
			'
            <div class="ekit-go-pro-notice">
                <strong>' . esc_html__( 'Thank you for using ElementsKit Lite.', 'elementskit-lite' ) . '</strong> ' . esc_html__( 'To get more amazing features and the outstanding pro ready-made layouts, please get the', 'elementskit-lite' ) . ' <a style="color: #FCB214;" target="_blank" href="https://wpmet.com/elementskit-pricing"> ' . esc_html__( 'Premium Version', 'elementskit-lite' ) . ' </a>.
            </div>
        '
		)
		->call();
	}
}
