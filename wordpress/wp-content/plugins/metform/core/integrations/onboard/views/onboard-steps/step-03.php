<div class="mf-onboard-main-header">
    <h1 class="mf-onboard-main-header--title"><strong><?php

echo esc_html__('Take your website to the next level', 'metform'); ?></strong></h1>
    <p class="mf-onboard-main-header--description"><?php echo esc_html__('A fleet of plugins with all types of features you will need for WordPress.', 'metform'); ?></p>
</div>

<div class="mf-onboard-plugin-list">
    <div class="attr-row">
        <?php
        $pluginStatus =  \MetForm\Core\Integrations\Onboard\Classes\Plugin_Status::instance();
        $plugins = \MetForm\Core\Integrations\Onboard\Attr::instance()->utils->get_option('settings', []);

        $elementskit = $pluginStatus->get_status( 'elementskit-lite/elementskit-lite.php' );
        $getgenie = $pluginStatus->get_status( 'getgenie/getgenie.php' );
        $shopengine = $pluginStatus->get_status( 'shopengine/shopengine.php' );
        $metform = $pluginStatus->get_status( 'metform/metform.php' );
        $emailkit = $pluginStatus->get_status( 'emailkit/EmailKit.php' );
        $popupkit = $pluginStatus->get_status( 'popup-builder-block/popup-builder-block.php' );
        $review = $pluginStatus->get_status( 'wp-ultimate-review/wp-ultimate-review.php' );
        $social = $pluginStatus->get_status( 'wp-social/wp-social.php' );

        $gutenkit = $pluginStatus->get_status( 'gutenkit-blocks-addon/gutenkit-blocks-addon.php' );
        $tablekit = $pluginStatus->get_status( 'table-builder-block/table-builder-block.php' );

        $woocommerce = $pluginStatus->get_status( 'woocommerce/woocommerce.php' );
        // Show unchecked when WooCommerce is active but ShopEngine is deactivated
        $shopengine_pre_check = '';
        ?>
        <div class="attr-col-lg-3">
            <div class="mf-onboard-single-plugin <?php echo esc_attr( $elementskit['status'] == 'activated' ? 'activated' : '' ); ?>">
                <label>
                    <div class="mf-onboard-single-plugin--header">
                        <h3>Page Builder Elements</h3>
                    </div>
                    <?php if($elementskit['status'] !== 'activated') : ?>
                        <div class="mf-onboard-single-plugin--checkbox-wrapper">
                            <input type="checkbox" class="mf-onboard-single-plugin--input" value="elementskit-lite/elementskit-lite.php" name="our_plugins[]">
                        </div>
                    <?php endif; ?>
                    <p class="mf-onboard-single-plugin--description">
                        <?php echo esc_html__( 'Best companion for Elementor with top widgets and templates.', 'metform' ); ?>
                    </p>
                </label>
            </div>
        </div>
        <div class="attr-col-lg-3">
            <div class="mf-onboard-single-plugin <?php echo esc_attr( $shopengine['status'] == 'activated' ? 'activated' : '' ); ?>">
                <label>
                    <div class="mf-onboard-single-plugin--header">
                        <h3>WooCommerce Builder</h3>
                    </div>
                    <?php if($shopengine['status'] !== 'activated') : ?>
                        <div class="mf-onboard-single-plugin--checkbox-wrapper">
                            <input type="checkbox" class="mf-onboard-single-plugin--input" value="shopengine/shopengine.php" name="our_plugins[]" <?php echo esc_attr($shopengine_pre_check); ?>>
                        </div>
                    <?php endif; ?>
                    <p class="mf-onboard-single-plugin--description">
                        <?php echo esc_html__( 'The ultimate solution to build a complete WooCommerce site in Elementor.', 'metform' ); ?>
                    </p>
                </label>
            </div>
        </div>
        <!-- Gutenberg plugins -->
        <div class="attr-col-lg-3">
            <div class="mf-onboard-single-plugin <?php echo esc_attr( $gutenkit['status'] == 'activated' ? 'activated' : '' ); ?>">
                <label>
                    <div class="mf-onboard-single-plugin--header">
                        <h3>Gutenberg Blocks</h3>
                    </div>
                    <?php if($gutenkit['status'] !== 'activated') : ?>
                        <div class="mf-onboard-single-plugin--checkbox-wrapper">
                            <input type="checkbox" class="mf-onboard-single-plugin--input" value="gutenkit-blocks-addon/gutenkit-blocks-addon.php" name="our_plugins[]">
                        </div>
                    <?php endif; ?>
                    <p class="mf-onboard-single-plugin--description">
                        <?php echo esc_html__( 'Enhance block capability with page builder features & templates for Gutenberg.', 'metform' ); ?>
                    </p>
                </label>
            </div>
        </div>
         <div class="attr-col-lg-3">
            <div class="mf-onboard-single-plugin <?php echo esc_attr( $popupkit['status'] == 'activated' ? 'activated' : '' ); ?>">
                <label>
                    <div class="mf-onboard-single-plugin--header">
                        <h3>Popup Builder</h3>
                    </div>
                    <?php if($popupkit['status'] !== 'activated') : ?>
                        <div class="mf-onboard-single-plugin--checkbox-wrapper">
                            <input type="checkbox" class="mf-onboard-single-plugin--input" value="popup-builder-block/popup-builder-block.php" name="our_plugins[]">
                        </div>
                    <?php endif; ?>
                    <p class="mf-onboard-single-plugin--description">
                        <?php echo esc_html__( 'Design popups that convert, right in your WordPress dashboard.', 'metform' ); ?>
                    </p>
                </label>
            </div>
        </div>
        <div class="attr-col-lg-3">
            <div class="mf-onboard-single-plugin <?php echo esc_attr( $emailkit['status'] == 'activated' ? 'activated' : '' ); ?>">
                <label>
                    <div class="mf-onboard-single-plugin--header">
                        <h3>Email Customizer</h3>
                    </div>
                    <?php if($emailkit['status'] !== 'activated') : ?>
                        <div class="mf-onboard-single-plugin--checkbox-wrapper">
                            <input type="checkbox" class="mf-onboard-single-plugin--input" value="emailkit/EmailKit.php" name="our_plugins[]">
                        </div>
                    <?php endif; ?>
                    <p class="mf-onboard-single-plugin--description">
                        <?php echo esc_html__( 'Drag-and-drop email builder for WooCommerce & WordPress.', 'metform' ); ?>
                    </p>
                </label>
            </div>
        </div>
        <div class="attr-col-lg-3">
            <div class="mf-onboard-single-plugin <?php echo esc_attr( $getgenie['status'] == 'activated' ? 'activated' : '' ); ?>">
                <label>
                    <div class="mf-onboard-single-plugin--header">
                        <h3>AI Content & SEO Tool</h3>
                    </div>
                    <?php if($getgenie['status'] !== 'activated') : ?>
                        <div class="mf-onboard-single-plugin--checkbox-wrapper">
                            <input type="checkbox" class="mf-onboard-single-plugin--input" value="getgenie/getgenie.php" name="our_plugins[]">
                        </div>
                    <?php endif; ?>
                    <p class="mf-onboard-single-plugin--description">
                        <?php echo esc_html__('Find top keywords, create winning content & track SEO results with AI.', 'metform' ); ?>
                    </p>
                </label>
            </div>
        </div>

    </div>
</div>
<div class="mf-onboard-pagination">
    <div class="mf-onboard-left">
        <a class="mf-onboard-btn mf-step-3-back-btn mf-onboard-pagi-btn prev" href="#"><i style="margin-right: -5px; margin-top: 4px;" class="xs-onboard-arrow-left"></i><?php echo esc_html__('Back', 'metform'); ?></a>
    </div>
    <div class="mf-onboard-right">
        <a class="mf-continue-button mf-onboard-pagi-btn next" href="#"><?php echo esc_html__('Continue', 'metform'); ?></a>
        <a class="mf-onboard-btn mf-onboard-pagi-btn mf-onboard-select-all-next-btn next" href="#"><?php echo esc_html__('Unlock All & Continue', 'metform'); ?></a>
    </div>
</div>
<div class="mf-onboard-shapes">
    <img src="<?php echo esc_url(self::get_url()); ?>assets/images/shape-06.png" alt="" class="shape-06">
    <img src="<?php echo esc_url(self::get_url()); ?>assets/images/shape-10.png" alt="" class="shape-10">
    <img src="<?php echo esc_url(self::get_url()); ?>assets/images/shape-11.png" alt="" class="shape-11">
    <img src="<?php echo esc_url(self::get_url()); ?>assets/images/shape-12.png" alt="" class="shape-12">
    <img src="<?php echo esc_url(self::get_url()); ?>assets/images/shape-13.png" alt="" class="shape-13">
</div>