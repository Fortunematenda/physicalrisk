<div class="emailkit-onboard-main-header">
    <h1 class="emailkit-onboard-main-header--title"><strong><?php

echo esc_html__('Take your website to the next level', 'emailkit'); ?></strong></h1>
    <p class="emailkit-onboard-main-header--description"><?php echo esc_html__('We have some plugins you can install to get most from Wordpress.', 'emailkit'); ?></p>
    <p class="emailkit-onboard-main-header--description"><?php echo esc_html__('These are absolute FREE to use.', 'emailkit'); ?></p>
</div>

<div class="emailkit-onboard-plugin-list">
    <div class="attr-row">
        <?php
        $pluginStatus =  \EmailKit\Promotional\Onboard\Classes\PluginStatus::instance();
        $plugins = \EmailKit\Promotional\Onboard\Attr::instance()->utils->get_option('settings', []);
        ?>
        <div class="attr-col-lg-8">
            <div class="emailkit-onboard-single-plugin badge--featured">
				<img class="badge--featured" src="<?php echo esc_url(self::get_url()); ?>assets/images/products/featured.svg">
                <label>
                    <img class="emailkit-onboard-single-plugin--logo" src="<?php echo esc_url(self::get_url()); ?>assets/images/products/getgenie-logo.svg" alt="<?php echo esc_html__('GetGenie', 'emailkit');?>">
                    <p class="emailkit-onboard-single-plugin--description"><span><?php echo esc_html__( 'Get FREE 2500 AI words, SEO Keyword, and Competitor Analysis credits', 'emailkit' )?> </span><?php echo esc_html__('on your personal AI assistant for Content & SEO right inside WordPress!', 'emailkit' ); ?></p>
                    <?php $plugin = $pluginStatus->get_status('getgenie/getgenie.php'); ?>
                    <a data-plugin_status="<?php echo esc_attr($plugin['status']); ?>" style="position: absolute;bottom: 37px;left: 27px;" style="position: absolute;bottom: 37px;left: 27px;" data-activation_url="<?php echo esc_url($plugin['activation_url']); ?>" href="<?php echo esc_url($plugin['installation_url']); ?>" class="emailkit-pro-btn emailkit-onboard-single-plugin--install_plugin <?php echo esc_attr($plugin['status'] == 'activated' ? 'activated' : ''); ?>"><?php echo esc_html($plugin['title']); ?></a>
                </label>
            </div>
        </div>
        <div class="attr-col-lg-4">
            <div class="emailkit-onboard-single-plugin">
                <label>
                    <img class="emailkit-onboard-single-plugin--logo" src="<?php echo esc_url(self::get_url()); ?>assets/images/products/gutenkit-logo.svg" alt="GutenKit">
                    <p class="emailkit-onboard-single-plugin--description"><?php echo esc_html__('Your Ultimate Page Builder Blocks for Gutenberg', 'emailkit'); ?></p>
                    <?php $plugin = $pluginStatus->get_status('gutenkit-blocks-addon/gutenkit-blocks-addon.php'); ?>
                    <a data-plugin_status="<?php echo esc_attr($plugin['status']); ?>" data-activation_url="<?php echo esc_url($plugin['activation_url']); ?>" href="<?php echo esc_url($plugin['installation_url']); ?>" class="emailkit-pro-btn emailkit-onboard-single-plugin--install_plugin <?php echo esc_attr( $plugin['status'] == 'activated' ? 'activated' : ''); ?>"><?php echo esc_html($plugin['title']); ?></a>
                </label>
            </div>
        </div>
        <div class="attr-col-lg-4">
            <div class="emailkit-onboard-single-plugin">
                <label>
                    <img class="emailkit-onboard-single-plugin--logo" src="<?php echo esc_url(self::get_url()); ?>assets/images/products/elementskit-logo.svg" alt="ElementsKit">
                    <p class="emailkit-onboard-single-plugin--description"><?php echo esc_html__('All-in-One Addons for Elementor', 'emailkit'); ?></p>
                    <?php $plugin = $pluginStatus->get_status('elementskit-lite/elementskit-lite.php'); ?>
                    <a data-plugin_status="<?php echo esc_attr($plugin['status']); ?>" style="position: absolute;bottom: 37px;left: 27px;" data-activation_url="<?php echo esc_url($plugin['activation_url']); ?>" href="<?php echo esc_url($plugin['installation_url']); ?>" class="emailkit-pro-btn emailkit-onboard-single-plugin--install_plugin <?php echo esc_attr($plugin['status'] == 'activated' ? 'activated' : ''); ?>"><?php echo esc_html($plugin['title']); ?></a>
                </label>
            </div>
        </div>
        <div class="attr-col-lg-4">
            <div class="emailkit-onboard-single-plugin">
                <label>
                    <img class="emailkit-onboard-single-plugin--logo" src="<?php echo esc_url(self::get_url()); ?>assets/images/products/shopengine-logo.svg" alt="ShopEngine">
                    <p class="emailkit-onboard-single-plugin--description" style="position: absolute;bottom: 89px;left: 27px;"><?php echo esc_html__('Completely customize your  WooCommerce WordPress', 'emailkit'); ?></p>
                    <?php $plugin = $pluginStatus->get_status('shopengine/shopengine.php'); ?>
                    <a data-plugin_status="<?php echo esc_attr($plugin['status']); ?>" style="position: absolute;bottom: 37px;left: 27px;" data-activation_url="<?php echo esc_url($plugin['activation_url']); ?>" href="<?php echo esc_url($plugin['installation_url']); ?>" class="emailkit-pro-btn emailkit-onboard-single-plugin--install_plugin <?php echo esc_attr( $plugin['status'] == 'activated' ? 'activated' : ''); ?>"><?php echo esc_html($plugin['title']); ?></a>
                </label>
            </div>
        </div>
        <div class="attr-col-lg-4">
            <div class="emailkit-onboard-single-plugin">
                <label>
                    <img class="emailkit-onboard-single-plugin--logo" src="<?php echo esc_url(self::get_url()); ?>assets/images/products/metform-logo.svg" alt="MetForm">
                    <p class="emailkit-onboard-single-plugin--description"><?php echo esc_html__('Most flexible drag-and-drop form builder', 'emailkit'); ?></p>
                    <?php $plugin = $pluginStatus->get_status('metform/metform.php'); ?>
                    <a data-plugin_status="<?php echo esc_attr($plugin['status']); ?>" data-activation_url="<?php echo esc_url($plugin['activation_url']); ?>" href="<?php echo esc_url($plugin['installation_url']); ?>" class="emailkit-pro-btn emailkit-onboard-single-plugin--install_plugin <?php echo esc_attr( $plugin['status'] == 'activated' ? 'activated' : ''); ?>"><?php echo esc_html($plugin['title']); ?></a>
                </label>
            </div>
        </div>
        <div class="attr-col-lg-4">
            <div class="emailkit-onboard-single-plugin">
                <label>
                    <img class="emailkit-onboard-single-plugin--logo" src="<?php echo esc_url(self::get_url()); ?>assets/images/products/wp-social-logo.svg" alt="WpSocial">
                    <p class="emailkit-onboard-single-plugin--description"><?php echo esc_html__('Integrate all your social media to your website', 'emailkit'); ?></p>
                    <?php $plugin = $pluginStatus->get_status('wp-social/wp-social.php'); ?>
                    <a data-plugin_status="<?php echo esc_attr($plugin['status']); ?>"  data-activation_url="<?php echo esc_url($plugin['activation_url']); ?>" href="<?php echo esc_url($plugin['installation_url']); ?>" class="emailkit-pro-btn emailkit-onboard-single-plugin--install_plugin <?php echo esc_attr($plugin['status'] == 'activated' ? 'activated' : ''); ?>"><?php echo esc_html($plugin['title']); ?></a>
                </label>
            </div>
        </div>
        <div class="attr-col-lg-4">
            <div class="emailkit-onboard-single-plugin">
                <label>
                    <img class="emailkit-onboard-single-plugin--logo" src="<?php echo esc_url(self::get_url()); ?>assets/images/products/ultimate-review-logo.svg" alt="UltimateReview">
                    <p class="emailkit-onboard-single-plugin--description" style="position: absolute; bottom:92px;"><?php echo esc_html__('Integrate various styled review system in your website', 'emailkit'); ?></p>
                    <?php $plugin = $pluginStatus->get_status('wp-ultimate-review/wp-ultimate-review.php'); ?>
                    <a data-plugin_status="<?php echo esc_attr($plugin['status']); ?>" style="position: absolute;bottom: 37px;left: 27px;" data-activation_url="<?php echo esc_url($plugin['activation_url']); ?>" href="<?php echo esc_url($plugin['installation_url']); ?>" class="emailkit-pro-btn emailkit-onboard-single-plugin--install_plugin <?php echo esc_attr($plugin['status'] == 'activated' ? 'activated' : ''); ?>"><?php echo esc_html($plugin['title']); ?></a>
                </label>
            </div>
        </div>
    </div>
</div>
<div class="emailkit-onboard-pagination">
    <a class="emailkit-onboard-btn emailkit-onboard-pagi-btn prev" data-plugin_status="<?php echo esc_attr($plugin['status']); ?>" data-activation_url="<?php echo esc_url($plugin['activation_url']) ?>" href="#"><i class="xs-onboard-arrow-left"></i><?php echo esc_html__('Back', 'emailkit'); ?></a>
    <a class="emailkit-onboard-btn emailkit-onboard-pagi-btn next" data-plugin_status="<?php echo esc_attr($plugin['status']); ?>" data-activation_url="<?php echo esc_url($plugin['activation_url']) ?>" href="#"><?php echo esc_html__('Next', 'emailkit'); ?></a>
</div>
<div class="emailkit-onboard-shapes">
    <img src="<?php echo esc_url(self::get_url()); ?>assets/images/shape-06.png" alt="" class="shape-06">
    <img src="<?php echo esc_url(self::get_url()); ?>assets/images/shape-10.png" alt="" class="shape-10">
    <img src="<?php echo esc_url(self::get_url()); ?>assets/images/shape-11.png" alt="" class="shape-11">
    <img src="<?php echo esc_url(self::get_url()); ?>assets/images/shape-12.png" alt="" class="shape-12">
    <img src="<?php echo esc_url(self::get_url()); ?>assets/images/shape-13.png" alt="" class="shape-13">
</div>