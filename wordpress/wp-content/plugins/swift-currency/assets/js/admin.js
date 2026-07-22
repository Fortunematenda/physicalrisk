/**
 * SwiftCurrency Admin JavaScript
 *
 * @package SwiftCurrency
 * @since 1.0.0
 */

(function ($) {
    'use strict';

    /**
     * Escape HTML to prevent XSS attacks.
     *
     * @param {string} text - Text to escape.
     * @return {string} Escaped text.
     */
    function escapeHtml(text) {
        const map = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;'
        };
        return String(text).replace(/[&<>"']/g, m => map[m]);
    }

    class SwiftCurrencyAdmin {
        constructor() {
            this.config = typeof swiftcurrencyAdmin !== 'undefined' ? swiftcurrencyAdmin : {};
            this.$body = $('body');
            this.$activeList = $('#sc-active-currencies');
            this.$panel = $('#sc-currency-selection-panel');
            this.$trigger = $('#sc-add-currency-trigger');
            this.$searchInput = $('#sc-selection-search-input');
            this.$baseSelect = $('#base_currency');

            this.init();
        }

        /**
         * Initialize all modules.
         */
        init() {
            this.initCurrencySelector();
            this.initToggles();
            this.initApiTesting();
            this.initFormValidation();
            this.initModals();
            this.initFlagUploader();
            this.initAdvancedSettings();
        }

        /**
         * Initialize currency selection and management.
         */
        initCurrencySelector() {
            if (!this.$activeList.length) return;

            // Toggle Panel
            this.$trigger.on('click', (e) => {
                e.stopPropagation();
                $('.sc-currency-selection-panel').not(this.$panel).removeClass('is-active');
                this.$panel.toggleClass('is-active');
                if (this.$panel.hasClass('is-active')) {
                    this.$searchInput.focus();
                }
            });

            // Close panel when clicking outside
            $(document).on('click', (e) => {
                if (!$(e.target).closest('.sc-add-currency-wrap').length) {
                    this.$panel.removeClass('is-active');
                }
            });

            // Search in panel
            this.$searchInput.on('input', (e) => {
                const q = $(e.target).val().toLowerCase();
                const $list = $('#sc-selection-list');

                $list.find('.sc-selection-item').each(function () {
                    const text = $(this).text().toLowerCase();
                    $(this).toggle(text.indexOf(q) !== -1);
                });

                // Hide headers if no visible items follow them until the next header
                $list.find('.sc-selection-header').each(function () {
                    const $header = $(this);
                    const $nextItems = $header.nextUntil('.sc-selection-header', '.sc-selection-item');
                    const hasVisibleItems = $nextItems.filter(':visible').length > 0;
                    $header.toggle(hasVisibleItems);
                });
            });

            // Select item from panel
            $(document).on('click', '.sc-selection-item', (e) => {
                const $item = $(e.currentTarget);
                if ($item.hasClass('is-selected')) return;

                // Free version: limit to 3 currencies (JS enforcement only; bypassed for Pro)
                const MAX_CURRENCIES = 3;
                const currentCount = $('input[name="swiftcurrency_settings[general][enabled_currencies][]"]').length;
                if (!this.config.isPro && currentCount >= MAX_CURRENCIES) {
                    this.$panel.removeClass('is-active');
                    this.$searchInput.val('').trigger('input');
                    this.showUpgradeNotice();
                    return;
                }

                const code = $item.data('code');
                const name = $item.data('name');
                const flag = $item.data('flag');

                const isCrypto = $item.find('.sc-crypto-badge').length > 0;

                this.addCurrencyItem(code, name, flag, null, isCrypto);
                $item.addClass('is-selected');
                this.$panel.removeClass('is-active');
                this.$searchInput.val('').trigger('input');
            });

            // Remove item
            $(document).on('click', '.sc-remove-currency', (e) => {
                e.preventDefault();
                const $item = $(e.currentTarget).closest('.sc-active-currency-item');
                if ($item.hasClass('is-base')) return;

                const code = $item.data('code');
                $item.remove();
                $(`#sc-selection-list .sc-selection-item[data-code="${code}"]`).removeClass('is-selected');
                this.$activeList.trigger('change');
            });

            // Handle base currency change
            this.$baseSelect.on('change', (e) => {
                const newBase = $(e.target).val();
                const $oldBaseItem = this.$activeList.find('.sc-active-currency-item.is-base');
                const $existingItem = this.$activeList.find(`.sc-active-currency-item[data-code="${newBase}"]`);

                if ($existingItem.length) {
                    // Scenario A: New base is already in the list
                    // Just swap roles
                    if ($oldBaseItem.length) {
                        this.setAsNormalCurrency($oldBaseItem);
                    }
                    this.setAsBaseCurrency($existingItem);
                } else if ($oldBaseItem.length) {
                    // Scenario B: New base is NOT in list, but we have an old base
                    // REPLACE the old base with the new one to preserve the count
                    const $selectionItem = $(`#sc-selection-list .sc-selection-item[data-code="${newBase}"]`);
                    if ($selectionItem.length) {
                        this.replaceCurrencyItem($oldBaseItem, $selectionItem);
                    }
                } else {
                    // Scenario C: No base item yet (unlikely), just add it
                    const $selectionItem = $(`#sc-selection-list .sc-selection-item[data-code="${newBase}"]`);
                    if ($selectionItem.length) {
                        $selectionItem.click();
                    }
                }
            });
        }

        /**
         * Add a new currency item to the active list.
         */
        addCurrencyItem(code, name, flag, isBase = null, isCrypto = false) {
            if (isBase === null) {
                isBase = (code === this.$baseSelect.val());
            }

            const flagHtml = flag
                ? `<img src="${escapeHtml(flag)}" alt="${escapeHtml(code)}" class="sc-flag">`
                : `<span class="sc-flag-placeholder">${escapeHtml(code.substring(0, 2))}</span>`;

            const removeBtn = !isBase
                ? '<button type="button" class="sc-remove-currency" title="Remove"><span class="dashicons dashicons-no-alt"></span></button>'
                : '';

            const baseBadge = isBase ? '<span class="sc-base-badge">Base</span>' : '';
            const cryptoBadge = isCrypto ? '<span class="sc-crypto-badge">Crypto</span>' : '';

            const html = `
                <div class="sc-active-currency-item${isBase ? ' is-base' : ''}" data-code="${escapeHtml(code)}">
                    <div class="sc-active-currency-info">
                        ${flagHtml}
                        <span class="sc-code">${escapeHtml(code)}</span>
                        <span class="sc-name">${escapeHtml(name)}</span>
                        ${cryptoBadge}
                        ${baseBadge}
                    </div>
                    <input type="hidden" name="swiftcurrency_settings[general][enabled_currencies][]" value="${escapeHtml(code)}">
                    ${removeBtn}
                </div>
            `;

            if (isBase) {
                this.$activeList.prepend(html);
            } else {
                this.$activeList.append(html);
            }

            this.$activeList.trigger('change');
        }

        /**
         * Replace an existing currency item with data from a selection item.
         */
        replaceCurrencyItem($oldItem, $selectionItem) {
            const oldCode = $oldItem.data('code');
            const newCode = $selectionItem.data('code');
            const newName = $selectionItem.data('name');
            const newFlag = $selectionItem.data('flag');

            // Update selectors
            $(`#sc-selection-list .sc-selection-item[data-code="${oldCode}"]`).removeClass('is-selected');
            $selectionItem.addClass('is-selected');

            // Update the item itself
            $oldItem.attr('data-code', newCode);
            $oldItem.data('code', newCode);

            const flagHtml = newFlag
                ? `<img src="${escapeHtml(newFlag)}" alt="${escapeHtml(newCode)}" class="sc-flag">`
                : `<span class="sc-flag-placeholder">${escapeHtml(newCode.substring(0, 2))}</span>`;

            const isCrypto = $selectionItem.find('.sc-crypto-badge').length > 0;

            $oldItem.find('.sc-active-currency-info').html(`
                ${flagHtml}
                <span class="sc-code">${escapeHtml(newCode)}</span>
                <span class="sc-name">${escapeHtml(newName)}</span>
                ${isCrypto ? '<span class="sc-crypto-badge">Crypto</span>' : ''}
                <span class="sc-base-badge">Base</span>
            `);

            $oldItem.find('input[type="hidden"]').val(newCode);
            $oldItem.addClass('is-base');
            $oldItem.find('.sc-remove-currency').remove();

            // Move to top
            this.$activeList.prepend($oldItem);
            this.$activeList.trigger('change');
        }

        /**
         * Set an item as base currency.
         */
        setAsBaseCurrency($item) {
            $item.addClass('is-base');
            $item.find('.sc-remove-currency').remove();
            if (!$item.find('.sc-base-badge').length) {
                $item.find('.sc-active-currency-info').append('<span class="sc-base-badge">Base</span>');
            }
            this.$activeList.prepend($item);
            this.$activeList.trigger('change');
        }

        /**
         * Revert a base currency item to a normal one.
         */
        setAsNormalCurrency($item) {
            $item.removeClass('is-base');
            $item.find('.sc-base-badge').remove();
            if (!$item.find('.sc-remove-currency').length) {
                $item.append('<button type="button" class="sc-remove-currency" title="Remove"><span class="dashicons dashicons-no-alt"></span></button>');
            }
        }

        /**
         * Initialize various toggle switches.
         */
        initToggles() {
            // Rate provider toggle
            $('#rate_provider').on('change', function () {
                const provider = $(this).val();
                $('.provider-api-key').toggle(!(provider === 'ecb' || provider === 'manual'));
            }).trigger('change');

            // Checkout multi-currency toggle
            $('#checkout_multi_currency').on('change', function () {
                $('#checkout-currency-options').toggle($(this).is(':checked'));
            }).trigger('change');

            // Charm pricing toggles
            $('#enable_charm_pricing').on('change', function () {
                $('.sc-charm-value-row').toggle($(this).is(':checked'));
            }).trigger('change');

            $('#enable_crypto_charm_pricing').on('change', function () {
                $('.sc-crypto-charm-value-row').toggle($(this).is(':checked'));
            }).trigger('change');
        }

        /**
         * Initialize API testing functionality.
         */
        initApiTesting() {
            const self = this;
            $('#test-api-connection, #test-crypto-api').on('click', function (e) {
                e.preventDefault();
                const $button = $(this);
                const isCrypto = $button.attr('id') === 'test-crypto-api';
                const originalText = $button.text();
                const provider = isCrypto ? $('#crypto_provider').val() : $('#rate_provider').val();
                const apiKey = isCrypto ? '' : $('#api_key').val();

                $button.prop('disabled', true).text(self.config.strings.testingApi || 'Testing...');

                $.post(self.config.ajaxUrl, {
                    action: 'swiftcurrency_test_api',
                    nonce: self.config.nonce,
                    provider: provider,
                    api_key: apiKey
                }, (response) => {
                    const type = response.success ? 'success' : 'error';
                    self.showNotice(type, response.data.message);
                }).fail(() => {
                    self.showNotice('error', self.config.strings.apiFailed || 'API test failed');
                }).always(() => {
                    $button.prop('disabled', false).text(originalText);
                });
            });
        }

        /**
         * Initialize form validation and submission handling.
         */
        initFormValidation() {
            const self = this;
            $('.swiftcurrency-form').on('submit', function (e) {
                const $form = $(this);
                const urlParams = new URLSearchParams(window.location.search);
                const currentTab = urlParams.get('tab') || 'general';

                if (currentTab === 'general') {
                    const $base = $('#base_currency');
                    if ($base.length && !$base.val()) {
                        self.showNotice('error', 'Please select a base currency.');
                        e.preventDefault();
                        return;
                    }

                    const enabledCount = $('input[name="swiftcurrency_settings[general][enabled_currencies][]"]').length;
                    if (enabledCount === 0) {
                        self.showNotice('error', 'Please enable at least one currency.');
                        e.preventDefault();
                        return;
                    }
                }

                $form.find('input[type="submit"]').val(self.config.strings.saving || 'Saving...');
            });
        }

        /**
         * Initialize modal functionality.
         */
        initModals() {
            const $modal = $('#swiftcurrency-edit-rate-modal');

            $(document).on('click', '.swiftcurrency-edit-rate', (e) => {
                e.preventDefault();
                const $link = $(e.currentTarget);
                const currency = $link.data('currency');
                const rate = $link.data('rate');

                $('#edit-currency-code').val(currency);
                $('#edit-currency-display').text(currency);
                $('#edit-exchange-rate').val(rate);

                $modal.fadeIn(200);
            });

            $(document).on('click', '.swiftcurrency-close-modal, .swiftcurrency-modal-overlay', (e) => {
                e.preventDefault();
                $modal.fadeOut(200);
            });

            $(document).on('click', '.swiftcurrency-modal-content', (e) => {
                e.stopPropagation();
            });
        }

        /**
         * Initialize flag uploader.
         */
        initFlagUploader() {
            let mediaUploader;
            $(document).on('click', '.swiftcurrency-upload-flag-btn', (e) => {
                e.preventDefault();

                if (typeof wp === 'undefined' || !wp.media) {
                    console.error('wp.media is not available.');
                    return;
                }

                if (mediaUploader) {
                    mediaUploader.open();
                    return;
                }

                mediaUploader = wp.media({
                    title: 'Choose Flag Image',
                    button: { text: 'Use this image' },
                    multiple: false,
                    frame: 'select'
                });

                mediaUploader.on('select', () => {
                    const attachment = mediaUploader.state().get('selection').first().toJSON();
                    $('#custom_currency_flag_url').val(attachment.url);
                });

                mediaUploader.open();
            });
        }

        /**
         * Initialize Advanced Settings Tab functionality.
         */
        initAdvancedSettings() {
            const self = this;

            // AJAX Auto-save
            $('.sc-auto-save').on('change', function () {
                const $el = $(this);
                const data = {
                    action: 'swiftcurrency_save_settings',
                    nonce: self.config.nonce,
                    section: $el.data('section'),
                    key: $el.data('key'),
                    value: $el.is(':checkbox') ? ($el.is(':checked') ? 1 : 0) : $el.val()
                };

                $el.css('opacity', '0.5');
                $.post(self.config.ajaxUrl, data, (response) => {
                    $el.css('opacity', '1');
                    const type = response.success ? 'success' : 'error';
                    self.showNotice(type, response.data.message || (response.success ? 'Updated' : 'Error'));
                }).fail(() => {
                    $el.css('opacity', '1');
                    self.showNotice('error', 'Network error');
                });
            });

            // Clear Rate Cache
            $('#clear-rate-cache').on('click', function (e) {
                e.preventDefault();
                const $btn = $(this);
                const $status = $('#clear-cache-status');

                $btn.prop('disabled', true).find('.dashicons').addClass('spin');
                $status.text('Clearing...');

                $.post(self.config.ajaxUrl, {
                    action: 'swiftcurrency_clear_cache',
                    nonce: self.config.nonce
                }, (response) => {
                    $btn.prop('disabled', false).find('.dashicons').removeClass('spin');
                    const color = response.success ? 'green' : 'red';
                    $status.text(response.data.message).css('color', color);
                    setTimeout(() => $status.text(''), 3000);
                });
            });

            // Reset All Settings
            $('#reset-all-settings').on('click', function (e) {
                e.preventDefault();
                if (!confirm('WARNING: This will permanently delete all SwiftCurrency settings. Are you sure?')) return;

                const $btn = $(this);
                $btn.prop('disabled', true).text('Resetting...');

                $.post(self.config.ajaxUrl, {
                    action: 'swiftcurrency_reset_settings',
                    nonce: self.config.nonce
                }, (response) => {
                    if (response.success) {
                        alert(response.data.message);
                        window.location.reload();
                    } else {
                        $btn.prop('disabled', false).text('Reset Settings');
                        alert(response.data.message);
                    }
                });
            });
        }

        /**
         * Show an admin notice.
         */
        showNotice(type, message) {
            let $notice = $('#sc-ajax-notice');
            if (!$notice.length) {
                $notice = $('<div id="sc-ajax-notice"></div>').appendTo('body');
            }

            $notice.attr('class', `sc-notice sc-notice-${type} ${type}`)
                .text(message)
                .fadeIn(300);

            setTimeout(() => {
                $notice.fadeOut(300);
            }, 3000);
        }

        /**
         * Show upgrade notice when free currency limit is reached.
         */
        showUpgradeNotice() {
            let $notice = $('#sc-limit-notice');
            if (!$notice.length) {
                $notice = $(
                    '<div id="sc-limit-notice" class="sc-notice sc-notice-warning" style="display:none;">' +
                    '<strong>Free limit reached:</strong> The free version supports up to 3 currencies. ' +
                    '<a href="https://codeies.com/account/swiftcurrency/" target="_blank" style="margin-left:6px;">Upgrade to Pro &rarr;</a>' +
                    '</div>'
                ).appendTo('body');
            }
            $notice.fadeIn(300);
            setTimeout(() => {
                $notice.fadeOut(300);
            }, 5000);
        }
    }

    // Initialize on document ready
    $(function () {
        window.SwiftCurrencyAdminInstance = new SwiftCurrencyAdmin();
    });

})(jQuery);
