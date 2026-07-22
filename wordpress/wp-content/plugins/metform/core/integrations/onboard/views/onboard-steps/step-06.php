<div class="mf-onboard-main-header">
	<h1 class="mf-onboard-main-header--title"><strong><?php echo esc_html__('Great! You’re All Set!', 'metform'); ?></strong></h1>
	<div class="mf-onboard-main-header--description-wrapper">
		<p class="mf-onboard-main-header--description">
			<?php echo esc_html__('Here’s an overview of everything that is setup.', 'metform'); ?>
		</p>
		<span class="mf-onboard-main-header--progress-percentage">0%</span>
	</div>
	<div class="mf-onboard-main-header--progress-bar">
		<div class="mf-onboard-main-header--progress"></div>
	</div>
</div>

<div class="configure-features" id="configure-mf-onboard"></div>

<div class="go-to-dashboard">
	<a class="mf-onboard-btn" href="<?php echo esc_url(admin_url('admin.php?page=metform-menu-settings')); ?>">
		<?php echo esc_html__( 'Go to WP Dashboard', 'metform' ); ?>
	</a>
</div>

<script>
    const target = document.getElementById('configure-mf-onboard');

    const observer = new IntersectionObserver(entries => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                // Create and dispatch a custom event
                const event = new CustomEvent('configureMfOnboard', {
                    detail: { message: 'configuring mf onboard' }
                });

                // Dispatch the event from the element or window
                window.dispatchEvent(event);
            }
        });
    }, {
        threshold: 0.1 // Adjust as needed
    });

    observer.observe(target);
</script>