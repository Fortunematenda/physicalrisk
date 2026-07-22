<div class="attr-input attr-input-radio emailkit-admin-input-radio <?php echo esc_attr($class); ?>">
    <div class="emailkit-admin-input-switch emailkit-admin-card-shadow attr-card-body">
        <input <?php echo esc_attr($options['checked'] === true ? 'checked' : ''); ?> 
            type="radio" value="<?php echo esc_attr($value); ?>" 
            class="emailkit-admin-control-input" 
            name="<?php echo esc_attr($name); ?>" 
            id="emailkit-admin-radio__<?php echo esc_attr(self::strify($name) . $value); ?>"

            <?php 
            if(isset($attr)){
                foreach($attr as $k => $v){
                    echo esc_attr("$k='$v'");
                }
            }
            ?>
        >

        <label class="emailkit-admin-control-label"  for="emailkit-admin-radio__<?php echo esc_attr(self::strify($name) . $value); ?>">
            <?php echo esc_html($label); ?>
            <?php if(!empty($description)) : ?>
                <span class="emailkit-admin-control-desc"><?php echo esc_html($description); ?></span>
            <?php endif; ?>
        </label>
    </div>
</div>