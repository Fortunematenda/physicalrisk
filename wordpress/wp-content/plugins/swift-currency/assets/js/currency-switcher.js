/**
 * SwiftCurrency Frontend JavaScript
 *
 * Handles currency switching without page reload.
 *
 * @package SwiftCurrency
 * @since 1.0.0
 */

(function ($) {
    'use strict';

    class SwiftCurrencySwitcher {

        constructor() {
            this.currentCurrency = swiftcurrency_params.current_currency;
            this.switching = false;
            this.init();
        }

        init() {
            this.bindEvents();
        }

        bindEvents() {
            const self = this;

            // ── Fancy Dropdown: toggle open/close ──────────────────────────
            $(document).on('click', '.swiftcurrency-trigger', function (e) {
                e.stopPropagation();
                const $dropdown = $(this).closest('.swiftcurrency-dropdown-fancy');
                const isOpen = $dropdown.hasClass('is-open');

                // Close all other open dropdowns first.
                $('.swiftcurrency-dropdown-fancy').not($dropdown).removeClass('is-open')
                    .find('.swiftcurrency-trigger').attr('aria-expanded', 'false');

                $dropdown.toggleClass('is-open', !isOpen);
                $(this).attr('aria-expanded', String(!isOpen));
            });

            // ── Fancy Dropdown: option click ───────────────────────────────
            $(document).on('click', '.swiftcurrency-option', function (e) {
                e.preventDefault();
                const $option = $(this);
                const currency = $option.data('currency');
                const $dropdown = $option.closest('.swiftcurrency-dropdown-fancy');

                if (currency === self.currentCurrency) {
                    $dropdown.removeClass('is-open');
                    $dropdown.find('.swiftcurrency-trigger').attr('aria-expanded', 'false');
                    return;
                }

                // Optimistically update the trigger UI.
                const $trigger = $dropdown.find('.swiftcurrency-trigger');
                const flagClass = $option.find('.swiftcurrency-flag').attr('class') || '';
                const labelText = $option.find('.swiftcurrency-option-label').text().trim();

                // Update flag in trigger.
                const $triggerFlag = $trigger.find('.swiftcurrency-flag');
                if ($triggerFlag.length && flagClass) {
                    $triggerFlag.attr('class', flagClass);
                }
                $trigger.find('.swiftcurrency-trigger-text').text(labelText);

                // Update active state in panel.
                $dropdown.find('.swiftcurrency-option').removeClass('is-active').attr('aria-selected', 'false')
                    .find('.swiftcurrency-check').remove();
                $option.addClass('is-active').attr('aria-selected', 'true')
                    .append('<svg class="swiftcurrency-check" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>');

                $dropdown.removeClass('is-open');
                $trigger.attr('aria-expanded', 'false');

                self.switchCurrency(currency);
            });

            // ── Close dropdown on outside click ────────────────────────────
            $(document).on('click', function () {
                $('.swiftcurrency-dropdown-fancy').removeClass('is-open')
                    .find('.swiftcurrency-trigger').attr('aria-expanded', 'false');
            });

            // ── Keyboard navigation for dropdown ───────────────────────────
            $(document).on('keydown', '.swiftcurrency-dropdown-fancy', function (e) {
                const $dropdown = $(this);
                const isOpen = $dropdown.hasClass('is-open');

                if (e.key === 'Escape' && isOpen) {
                    $dropdown.removeClass('is-open');
                    $dropdown.find('.swiftcurrency-trigger').attr('aria-expanded', 'false').focus();
                }

                if ((e.key === 'Enter' || e.key === ' ') && !isOpen) {
                    e.preventDefault();
                    $dropdown.addClass('is-open');
                    $dropdown.find('.swiftcurrency-trigger').attr('aria-expanded', 'true');
                }
            });

            // ── List: link click ───────────────────────────────────────────
            $(document).on('click', '.swiftcurrency-currency-link', function (e) {
                e.preventDefault();
                const currency = $(this).data('currency');
                if (currency === self.currentCurrency) return;

                // Update active state optimistically.
                const $list = $(this).closest('.swiftcurrency-list');
                $list.find('.swiftcurrency-currency-item').removeClass('is-active').attr('aria-selected', 'false');
                $list.find('.swiftcurrency-check').remove();
                const $item = $(this).closest('.swiftcurrency-currency-item');
                $item.addClass('is-active').attr('aria-selected', 'true');
                $(this).append('<svg class="swiftcurrency-check" xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>');

                self.switchCurrency(currency);
            });

            // ── Buttons: click ─────────────────────────────────────────────
            $(document).on('click', '.swiftcurrency-button', function (e) {
                e.preventDefault();
                const currency = $(this).data('currency');
                if (currency === self.currentCurrency) return;

                // Update active state optimistically.
                const $group = $(this).closest('.swiftcurrency-buttons');
                $group.find('.swiftcurrency-button').removeClass('is-active').attr('aria-pressed', 'false');
                $(this).addClass('is-active').attr('aria-pressed', 'true');

                self.switchCurrency(currency);
            });

            // ── Segmented: click ───────────────────────────────────────────
            $(document).on('click', '.swiftcurrency-segment', function (e) {
                e.preventDefault();
                const currency = $(this).data('currency');
                if (currency === self.currentCurrency) return;

                $(this).closest('.swiftcurrency-segmented').find('.swiftcurrency-segment').removeClass('is-active');
                $(this).addClass('is-active');

                self.switchCurrency(currency);
            });

            // ── Chips: click ───────────────────────────────────────────────
            $(document).on('click', '.swiftcurrency-chip', function (e) {
                e.preventDefault();
                const currency = $(this).data('currency');
                if (currency === self.currentCurrency) return;

                $(this).closest('.swiftcurrency-chips').find('.swiftcurrency-chip').removeClass('is-active');
                $(this).addClass('is-active');

                self.switchCurrency(currency);
            });

            // ── Stack (Wait list variant): click ───────────────────────────
            $(document).on('click', '.swiftcurrency-stack-item', function (e) {
                e.preventDefault();
                const currency = $(this).data('currency');
                if (currency === self.currentCurrency) return;

                $(this).closest('.swiftcurrency-stack').find('.swiftcurrency-stack-item').removeClass('is-active');
                $(this).addClass('is-active');

                self.switchCurrency(currency);
            });

            // ── Glass Float: toggle and option click ──────────────────────
            $(document).on('click', '.swiftcurrency-float-trigger', function (e) {
                e.stopPropagation();
                const $float = $(this).closest('.swiftcurrency-glass-float');
                $('.swiftcurrency-glass-float').not($float).removeClass('is-open');
                $float.toggleClass('is-open');
            });

            $(document).on('click', '.swiftcurrency-float-option', function (e) {
                e.preventDefault();
                const currency = $(this).data('currency');
                if (currency === self.currentCurrency) {
                    $(this).closest('.swiftcurrency-glass-float').removeClass('is-open');
                    return;
                }

                $(this).closest('.swiftcurrency-float-panel').find('.swiftcurrency-float-option').removeClass('is-active');
                $(this).addClass('is-active');
                $(this).closest('.swiftcurrency-glass-float').removeClass('is-open');

                self.switchCurrency(currency);
            });

            // ── Neon: click ───────────────────────────────────────────────
            $(document).on('click', '.swiftcurrency-neon-tag', function (e) {
                e.preventDefault();
                const currency = $(this).data('currency');
                if (currency === self.currentCurrency) return;

                $(this).closest('.swiftcurrency-neon').find('.swiftcurrency-neon-tag').removeClass('is-active');
                $(this).addClass('is-active');

                self.switchCurrency(currency);
            });

            // ── Native Select: change ──────────────────────────────────────
            $(document).on('change', '.swiftcurrency-native', function () {
                const currency = $(this).val();
                if (currency === self.currentCurrency) return;
                self.switchCurrency(currency);
            });
        }

        /**
         * Switch currency via AJAX.
         *
         * @param {string} currency Currency code.
         */
        switchCurrency(currency) {
            if (this.switching) return;

            this.switching = true;
            this.showLoading();

            $.ajax({
                url: swiftcurrency_params.ajax_url,
                type: 'POST',
                data: {
                    action: 'swiftcurrency_switch_currency',
                    currency: currency,
                    nonce: swiftcurrency_params.nonce,
                },
                success: (response) => {
                    if (response.success) {
                        this.currentCurrency = currency;
                        $(document).trigger('swiftcurrency_switched', [currency, response.data]);
                        window.location.reload();
                    } else {
                        this.onError(response.data ? response.data.message : null);
                    }
                },
                error: () => {
                    this.onError(null);
                },
                complete: () => {
                    this.switching = false;
                    this.hideLoading();
                },
            });
        }

        onError(message) {
            console.error('SwiftCurrency:', message || 'Failed to switch currency.');
        }

        showLoading() {
            $('.swiftcurrency-switcher').addClass('loading');
        }

        hideLoading() {
            $('.swiftcurrency-switcher').removeClass('loading');
        }
    }

    $(document).ready(function () {
        if (typeof swiftcurrency_params !== 'undefined') {
            new SwiftCurrencySwitcher();
        }
    });

})(jQuery);
