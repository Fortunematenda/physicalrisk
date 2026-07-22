<div class="emailkit-onboard-main-header">
    <h1 class="emailkit-onboard-main-header--title"><strong><?php

echo esc_html__('Check out This Video to Get Started ⤵️', 'emailkit'); ?></strong></h1>
</div>
<div class="emailkit-onboard-tutorial">
    <div class="emailkit-onboard-tutorial--btn">
        <a class="emailkit-onboard-tutorial--link" data-video_id="Fz_1M-s_Faw" href="#"><i class="xs-onboard-play"></i></a>
    </div>
    
    <div class="emailkit-admin-video-tutorial-popup">
            <div class="emailkit-admin-video-tutorial-iframe"></div>
    </div>
</div>


<div class="emailkit-onboard-tut-term">
    <label class="emailkit-onboard-tut-term--label">
        <?php $term = EmailKit\Promotional\Onboard\Attr::instance()->utils->get_option('settings', []);
        ?>
        <input <?php if(empty($term['tut_term']) || $term['tut_term'] !== 'user_agreed') : ?>checked="checked"<?php endif; ?> class="emailkit-onboard-tut-term--input" name="settings[tut_term]" type="checkbox" value="user_agreed">
        <?php echo esc_html__('Share non-sensitive diagnostic data and details about plugin usage.', 'emailkit'); ?>
    </label>

    <p class="emailkit-onboard-tut-term--helptext"><?php echo esc_html__("We gather non-sensitive diagnostic data as well as information about plugin use. Your site's URL, WordPress and PHP versions, plugins and themes, as well as your email address, will be used to give you a discount coupon. This information enables us to ensure that this plugin remains consistent with the most common plugins and themes at all times. We pledge not to give you any spam, for sure.", 'emailkit'); ?></p>
    <p class="emailkit-onboard-tut-term--help"><?php echo esc_html__('What types of information do we gather?', 'emailkit'); ?></p>
</div>
<div class="emailkit-onboard-pagination">
    <a class="emailkit-onboard-btn emailkit-onboard-pagi-btn prev" href="#"><i class="xs-onboard-arrow-left"></i><?php echo esc_html__('Back', 'emailkit'); ?></a>
    <a class="emailkit-onboard-btn emailkit-onboard-pagi-btn next" href="#"><?php echo esc_html__('Next', 'emailkit'); ?></a>
</div>
<div class="emailkit-onboard-shapes">
    <img src="<?php echo esc_url(self::get_url()); ?>assets/images/shape-07.png" alt="" class="shape-07">
    <img src="<?php echo esc_url(self::get_url()); ?>assets/images/shape-14.png" alt="" class="shape-14">
    <img src="<?php echo esc_url(self::get_url()); ?>assets/images/shape-15.png" alt="" class="shape-15">
    <img src="<?php echo esc_url(self::get_url()); ?>assets/images/shape-16.png" alt="" class="shape-16">
    <img src="<?php echo esc_url(self::get_url()); ?>assets/images/shape-17.png" alt="" class="shape-17">
</div>