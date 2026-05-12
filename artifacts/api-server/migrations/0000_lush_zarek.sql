CREATE TYPE "public"."user_role" AS ENUM('admin', 'user', 'guest');--> statement-breakpoint
CREATE TYPE "public"."order_status" AS ENUM('pending', 'confirmed', 'processing', 'shipped', 'out_for_delivery', 'delivered', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('unpaid', 'pending', 'paid');--> statement-breakpoint
CREATE TYPE "public"."coupon_type" AS ENUM('percentage', 'fixed');--> statement-breakpoint
CREATE TYPE "public"."tx_type" AS ENUM('credit', 'debit');--> statement-breakpoint
CREATE TYPE "public"."device_type" AS ENUM('android', 'ios', 'web');--> statement-breakpoint
CREATE TYPE "public"."notification_status" AS ENUM('pending', 'sent', 'failed');--> statement-breakpoint
CREATE TYPE "public"."notification_type" AS ENUM('order_update', 'promotion', 'general');--> statement-breakpoint
CREATE TYPE "public"."integration_type" AS ENUM('ecommerce', 'marketing', 'analytics');--> statement-breakpoint
CREATE TYPE "public"."sync_job_status" AS ENUM('pending', 'running', 'completed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."sync_status_type" AS ENUM('idle', 'syncing', 'completed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."payment_gateway_type" AS ENUM('cod', 'jazzcash', 'easypaisa', 'stripe', 'bank_transfer', 'wallet', 'card');--> statement-breakpoint
CREATE TYPE "public"."shipment_status" AS ENUM('pending', 'processing', 'shipped', 'in_transit', 'out_for_delivery', 'delivered', 'failed', 'returned');--> statement-breakpoint
CREATE TYPE "public"."abandoned_checkout_status" AS ENUM('active', 'recovered', 'expired');--> statement-breakpoint
CREATE TYPE "public"."shipping_rule_type" AS ENUM('weight', 'amount', 'product', 'category', 'flat');--> statement-breakpoint
CREATE TYPE "public"."bid_auction_status" AS ENUM('draft', 'active', 'ended', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."bid_status" AS ENUM('active', 'won', 'outbid', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."meezan_txn_status" AS ENUM('initiated', 'pending', 'paid', 'failed', 'refunded', 'partial_refund', 'reversed', 'disputed', 'chargeback');--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"phone" text NOT NULL,
	"email" text,
	"password_hash" text,
	"role" "user_role" DEFAULT 'user' NOT NULL,
	"city" text,
	"country" text DEFAULT 'Pakistan',
	"address" text,
	"postal_code" text,
	"profile_image" text,
	"gender" text,
	"date_of_birth" date,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_phone_unique" UNIQUE("phone"),
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"icon" text,
	"image_url" text,
	"alt_text" text,
	"color" text DEFAULT 'bg-green-100 text-green-700',
	"parent_id" integer,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"meta_title" text,
	"meta_description" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "categories_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" serial PRIMARY KEY NOT NULL,
	"category_id" integer,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"shopify_product_id" text,
	"shopify_handle" text,
	"woocommerce_product_id" text,
	"description" text,
	"price" numeric(10, 2) NOT NULL,
	"original_price" numeric(10, 2),
	"stock" integer DEFAULT 0 NOT NULL,
	"images" jsonb DEFAULT '[]'::jsonb,
	"gradient" text DEFAULT 'from-gray-100 to-gray-200',
	"tags" jsonb DEFAULT '[]'::jsonb,
	"variants" jsonb DEFAULT '[]'::jsonb,
	"weight" text,
	"unit" text,
	"active" boolean DEFAULT true NOT NULL,
	"featured" boolean DEFAULT false NOT NULL,
	"rating" numeric(3, 2) DEFAULT '0',
	"review_count" integer DEFAULT 0 NOT NULL,
	"meta_title" text,
	"meta_description" text,
	"alt_text" text,
	"source" text DEFAULT 'manual',
	"external_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "products_slug_unique" UNIQUE("slug"),
	CONSTRAINT "products_shopify_product_id_unique" UNIQUE("shopify_product_id"),
	CONSTRAINT "products_woocommerce_product_id_unique" UNIQUE("woocommerce_product_id")
);
--> statement-breakpoint
CREATE TABLE "banners" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"subtitle" text,
	"image_url" text,
	"mobile_image_url" text,
	"link_url" text,
	"target_type" text,
	"target_id" integer,
	"bg_color" text DEFAULT 'from-[#5FA800] to-[#4d8a00]',
	"text_color" text DEFAULT 'white',
	"label" text,
	"cta" text DEFAULT 'Shop Now',
	"platform" text DEFAULT 'both',
	"sort_order" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"countdown_end_at" timestamp,
	"start_date" timestamp,
	"end_date" timestamp,
	"offer_product_ids" jsonb DEFAULT '[]'::jsonb,
	"video_url" text,
	"mobile_video_url" text,
	"video_autoplay" boolean DEFAULT true,
	"video_muted" boolean DEFAULT true,
	"video_loop" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" integer NOT NULL,
	"product_id" integer,
	"name" text NOT NULL,
	"variant" text,
	"price" numeric(10, 2) NOT NULL,
	"qty" integer DEFAULT 1 NOT NULL,
	"gradient" text
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer,
	"order_number" text NOT NULL,
	"status" "order_status" DEFAULT 'pending' NOT NULL,
	"payment_status" "payment_status" DEFAULT 'unpaid' NOT NULL,
	"subtotal" numeric(10, 2) NOT NULL,
	"discount" numeric(10, 2) DEFAULT '0' NOT NULL,
	"delivery_fee" numeric(10, 2) DEFAULT '0' NOT NULL,
	"loyalty_discount" numeric(10, 2) DEFAULT '0' NOT NULL,
	"wallet_discount" numeric(10, 2) DEFAULT '0' NOT NULL,
	"total" numeric(10, 2) NOT NULL,
	"delivery_type" text DEFAULT 'standard',
	"courier" text DEFAULT 'tcs',
	"payment_method" text DEFAULT 'cod',
	"reference_number" text,
	"payment_screenshot" text,
	"shipping_address" jsonb,
	"coupon_code" text,
	"notes" text,
	"tracking_id" text,
	"confirmed_at" timestamp,
	"packed_at" timestamp,
	"shipped_at" timestamp,
	"out_for_delivery_at" timestamp,
	"delivered_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "orders_order_number_unique" UNIQUE("order_number")
);
--> statement-breakpoint
CREATE TABLE "coupon_usages" (
	"id" serial PRIMARY KEY NOT NULL,
	"coupon_id" integer NOT NULL,
	"user_id" integer,
	"order_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "coupons" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"description" text,
	"type" "coupon_type" DEFAULT 'percentage' NOT NULL,
	"value" numeric(10, 2) NOT NULL,
	"min_order" numeric(10, 2) DEFAULT '0',
	"max_uses" integer,
	"used_count" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp,
	"active" boolean DEFAULT true NOT NULL,
	"auto_send_on_abandon" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "coupons_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "loyalty_transactions" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"points" integer NOT NULL,
	"type" "tx_type" NOT NULL,
	"description" text NOT NULL,
	"reference_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wallet_transactions" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"amount" numeric(10, 2) NOT NULL,
	"type" "tx_type" NOT NULL,
	"description" text NOT NULL,
	"reference_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "push_notifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer,
	"title" text NOT NULL,
	"message" text NOT NULL,
	"type" "notification_type" DEFAULT 'general' NOT NULL,
	"status" "notification_status" DEFAULT 'pending' NOT NULL,
	"is_broadcast" boolean DEFAULT false NOT NULL,
	"recipient_count" integer DEFAULT 0,
	"success_count" integer DEFAULT 0,
	"failure_count" integer DEFAULT 0,
	"data" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"sent_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "user_devices" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"device_token" text NOT NULL,
	"device_type" "device_type" DEFAULT 'android' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "integrations" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"type" "integration_type" NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb,
	"is_active" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "marketing_integrations" (
	"id" serial PRIMARY KEY NOT NULL,
	"platform" text NOT NULL,
	"pixel_id" text,
	"access_token" text,
	"is_active" boolean DEFAULT false NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shopify_integrations" (
	"id" serial PRIMARY KEY NOT NULL,
	"store_url" text NOT NULL,
	"api_key" text NOT NULL,
	"access_token" text NOT NULL,
	"sync_status" "sync_status_type" DEFAULT 'idle',
	"last_sync_at" timestamp,
	"error_message" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sync_jobs" (
	"id" serial PRIMARY KEY NOT NULL,
	"integration_type" text NOT NULL,
	"status" "sync_job_status" DEFAULT 'pending' NOT NULL,
	"logs" jsonb DEFAULT '[]'::jsonb,
	"total_items" integer DEFAULT 0,
	"success_count" integer DEFAULT 0,
	"failed_count" integer DEFAULT 0,
	"meta" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "woocommerce_integrations" (
	"id" serial PRIMARY KEY NOT NULL,
	"store_url" text NOT NULL,
	"consumer_key" text NOT NULL,
	"consumer_secret" text NOT NULL,
	"sync_status" "sync_status_type" DEFAULT 'idle',
	"last_sync_at" timestamp,
	"error_message" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "courier_notification_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"shipment_id" integer NOT NULL,
	"order_id" integer NOT NULL,
	"tracking_id" text,
	"courier_slug" text,
	"shipment_status" text,
	"channel" text NOT NULL,
	"phone" text,
	"email" text,
	"customer_name" text,
	"message" text,
	"success" boolean DEFAULT false NOT NULL,
	"error" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "courier_retargeting_queue" (
	"id" serial PRIMARY KEY NOT NULL,
	"shipment_id" integer NOT NULL,
	"order_id" integer NOT NULL,
	"tracking_id" text,
	"courier_slug" text,
	"customer_name" text,
	"phone" text,
	"email" text,
	"order_total" numeric(10, 2),
	"delivered_at" timestamp,
	"scheduled_for" timestamp,
	"channel" text DEFAULT 'whatsapp' NOT NULL,
	"message" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"sent_at" timestamp,
	"error" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "couriers" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"api_key" text,
	"api_secret" text,
	"api_endpoint" text,
	"is_active" boolean DEFAULT false NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"settings" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "couriers_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "manual_payments" (
	"id" serial PRIMARY KEY NOT NULL,
	"bank_name" text NOT NULL,
	"account_title" text NOT NULL,
	"account_number" text NOT NULL,
	"iban" text,
	"instructions" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_gateways" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"type" "payment_gateway_type" NOT NULL,
	"display_name" text NOT NULL,
	"description" text,
	"api_key" text,
	"secret_key" text,
	"webhook_secret" text,
	"is_active" boolean DEFAULT false NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rider_cod_settlements" (
	"id" serial PRIMARY KEY NOT NULL,
	"rider_id" integer NOT NULL,
	"type" text DEFAULT 'full' NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"notes" text,
	"settled_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rider_deliveries" (
	"id" serial PRIMARY KEY NOT NULL,
	"rider_id" integer,
	"shopify_order_db_id" integer,
	"shopify_order_id" text,
	"shopify_order_number" text,
	"customer_name" text,
	"customer_phone" text,
	"delivery_address" text,
	"city" text DEFAULT 'Lahore',
	"cod_amount" numeric(12, 2) DEFAULT '0',
	"is_paid" boolean DEFAULT false,
	"order_items" jsonb DEFAULT '[]'::jsonb,
	"status" text DEFAULT 'pending' NOT NULL,
	"wa_sent_at" timestamp,
	"wa_message_id" text,
	"invoice_url" text,
	"notes" text,
	"assigned_at" timestamp,
	"picked_at" timestamp,
	"out_for_delivery_at" timestamp,
	"delivered_at" timestamp,
	"failed_at" timestamp,
	"returned_at" timestamp,
	"retry_count" integer DEFAULT 0,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"delivery_charge" numeric DEFAULT '500',
	"rider_payment_status" text DEFAULT 'pending',
	"rider_payment_date" timestamp,
	"rider_paid_amount" numeric DEFAULT '0',
	"customer_wa_sent_at" timestamp,
	"eta_minutes" integer,
	"near_customer_at" timestamp,
	"delayed_at" timestamp,
	"cod_reminder_sent_at" timestamp,
	"customer_wa_assigned_at" timestamp,
	"customer_wa_status_at" timestamp,
	"delivery_mode" text DEFAULT 'auto',
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "riders" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"phone" text NOT NULL,
	"whatsapp_number" text,
	"delivery_area" text,
	"status" text DEFAULT 'active' NOT NULL,
	"notes" text,
	"avatar_url" text,
	"cnic" text,
	"vehicle_type" text DEFAULT 'bike',
	"password_hash" text,
	"expo_push_token" text,
	"delivery_charge_per_order" numeric DEFAULT '500',
	"location_lat" numeric(10, 7),
	"location_lng" numeric(10, 7),
	"location_updated_at" timestamp,
	"location_accuracy" numeric(8, 2),
	"location_speed" numeric(8, 2),
	"location_heading" numeric(6, 2),
	"is_online" boolean DEFAULT false NOT NULL,
	"cash_limit" numeric DEFAULT '50000',
	"current_cash" numeric DEFAULT '0',
	"shift_start" text,
	"shift_end" text,
	"auto_assign_enabled" boolean DEFAULT true,
	"max_active_orders" integer DEFAULT 200,
	"zone" text DEFAULT 'lahore',
	"priority" integer DEFAULT 1,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "same_day_delivery_settings" (
	"id" serial PRIMARY KEY NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"price" integer DEFAULT 250 NOT NULL,
	"city" text DEFAULT 'Lahore' NOT NULL,
	"cutoff_hour" integer DEFAULT 15 NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shipments" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" integer NOT NULL,
	"courier_id" integer,
	"courier_slug" text,
	"tracking_id" text,
	"status" "shipment_status" DEFAULT 'pending' NOT NULL,
	"status_history" jsonb DEFAULT '[]'::jsonb,
	"weight" numeric(8, 2),
	"dimensions" text,
	"last_tracked_at" timestamp,
	"raw_response" jsonb DEFAULT '{}'::jsonb,
	"shopify_order_id" text,
	"shopify_order_number" text,
	"customer_name" text,
	"customer_phone" text,
	"customer_address" text,
	"customer_city" text,
	"cod_amount" numeric(10, 2) DEFAULT '0',
	"pieces" integer DEFAULT 1,
	"content_desc" text DEFAULT 'KDF Nuts Products',
	"service_code" text DEFAULT 'O',
	"special_instructions" text,
	"is_cod" boolean DEFAULT false,
	"cod_status" text DEFAULT 'pending',
	"is_cancelled" boolean DEFAULT false,
	"notify_whatsapp" boolean DEFAULT true,
	"booking_source" text DEFAULT 'manual',
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cities_pakistan" (
	"id" serial PRIMARY KEY NOT NULL,
	"city_name" text NOT NULL,
	"province" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "google_map_settings" (
	"id" serial PRIMARY KEY NOT NULL,
	"api_key" text,
	"server_api_key" text,
	"is_enabled" boolean DEFAULT false NOT NULL,
	"auto_detect_location" boolean DEFAULT true NOT NULL,
	"default_country" text DEFAULT 'Pakistan' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_locations" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer,
	"session_id" text,
	"latitude" numeric(10, 7),
	"longitude" numeric(10, 7),
	"full_address" text,
	"city" text,
	"country" text DEFAULT 'Pakistan',
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chatbot_settings" (
	"id" serial PRIMARY KEY NOT NULL,
	"is_enabled" boolean DEFAULT false NOT NULL,
	"ordering_enabled" boolean DEFAULT false NOT NULL,
	"ai_model" text DEFAULT 'gpt-4o-mini' NOT NULL,
	"system_prompt" text DEFAULT 'You are a helpful customer support assistant for KDF NUTS, a premium dry fruits and nuts store in Pakistan. Be friendly, concise, and helpful in both English and Urdu. Answer questions about products, orders, shipping, and returns. If order context is provided at the top of this conversation, use it to give accurate, personalised answers about the customer''s orders. If you don''t know something specific, offer to connect them with the team.' NOT NULL,
	"fallback_message" text DEFAULT 'Thank you for your message! Our team will get back to you shortly. 🙏' NOT NULL,
	"order_context_enabled" boolean DEFAULT true NOT NULL,
	"reply_delay_sec" integer DEFAULT 30 NOT NULL,
	"max_daily_replies" integer DEFAULT 100 NOT NULL,
	"menu_enabled" boolean DEFAULT false NOT NULL,
	"menu_greeting_keywords" text DEFAULT 'hi,hello,hey,salam,salaam,asslam,start,menu,help,shop,helo,hii',
	"menu_items" jsonb,
	"greeting_message" text,
	"catalog_enabled" boolean DEFAULT false NOT NULL,
	"catalog_max_products" integer DEFAULT 3 NOT NULL,
	"website_url" text DEFAULT 'https://kdfnuts.com',
	"discount_code" text DEFAULT 'WELCOME10',
	"discount_message" text DEFAULT 'Here''s your exclusive discount code! 🎁

*Code:* WELCOME10
*Save:* 10% on your next order

Shop now and use the code at checkout 🛒',
	"hot_deals_message" text DEFAULT '🔥 *Today''s Hot Deals at KDF NUTS* 🥜

Check our latest offers on premium nuts and dry fruits!

Visit our website to see all deals 👇',
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wa_flows" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"trigger_type" text DEFAULT 'keyword' NOT NULL,
	"keywords" jsonb DEFAULT '[]'::jsonb,
	"action" text DEFAULT 'ai_reply' NOT NULL,
	"action_data" jsonb DEFAULT '{}'::jsonb,
	"is_enabled" boolean DEFAULT true NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"fired_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "whatsapp_campaigns" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"type" text DEFAULT 'custom' NOT NULL,
	"message_body" text DEFAULT '' NOT NULL,
	"template_id" text,
	"template_params" text,
	"header_image_url" text,
	"audience" text DEFAULT 'all_customers' NOT NULL,
	"audience_filter" text,
	"custom_phones" text,
	"rate_limit_delay" integer DEFAULT 2 NOT NULL,
	"max_delay" integer DEFAULT 5 NOT NULL,
	"frequency_cap_hours" integer DEFAULT 24 NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"recipient_count" integer DEFAULT 0 NOT NULL,
	"sent_count" integer DEFAULT 0 NOT NULL,
	"failed_count" integer DEFAULT 0 NOT NULL,
	"delivered_count" integer DEFAULT 0 NOT NULL,
	"read_count" integer DEFAULT 0 NOT NULL,
	"skipped_count" integer DEFAULT 0 NOT NULL,
	"scheduled_at" timestamp,
	"paused_at" timestamp,
	"tags" text,
	"sent_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "whatsapp_conversation_states" (
	"id" serial PRIMARY KEY NOT NULL,
	"phone" text NOT NULL,
	"state" text DEFAULT 'idle' NOT NULL,
	"state_data" text,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "whatsapp_conversation_states_phone_unique" UNIQUE("phone")
);
--> statement-breakpoint
CREATE TABLE "whatsapp_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer,
	"phone" text,
	"message_id" text,
	"delivery_status" text,
	"template_name" text,
	"message" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"response" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "whatsapp_settings" (
	"id" serial PRIMARY KEY NOT NULL,
	"access_token" text,
	"phone_number_id" text,
	"business_account_id" text,
	"webhook_verify_token" text DEFAULT 'kdfnuts_webhook_token',
	"is_active" boolean DEFAULT false NOT NULL,
	"rate_limit_delay_seconds" integer DEFAULT 2 NOT NULL,
	"chat_button_enabled" boolean DEFAULT false NOT NULL,
	"chat_button_phone" text,
	"chat_button_message" text DEFAULT 'Hi! I''d like to know more about your products.',
	"abandoned_recovery_enabled" boolean DEFAULT false NOT NULL,
	"abandoned_recovery_delay_minutes" integer DEFAULT 45 NOT NULL,
	"abandoned_recovery_coupon_code" text,
	"notify_order_confirmation" boolean DEFAULT true NOT NULL,
	"notify_order_processing" boolean DEFAULT true NOT NULL,
	"notify_order_shipped" boolean DEFAULT true NOT NULL,
	"notify_order_out_for_delivery" boolean DEFAULT true NOT NULL,
	"notify_order_delivered" boolean DEFAULT true NOT NULL,
	"notify_order_cancelled" boolean DEFAULT false NOT NULL,
	"notify_restock" boolean DEFAULT true NOT NULL,
	"notify_bidding_winner" boolean DEFAULT true NOT NULL,
	"qr_message" text DEFAULT 'Hello! I want to place an order 🥜',
	"qr_scan_count" integer DEFAULT 0 NOT NULL,
	"qr_version" integer DEFAULT 1 NOT NULL,
	"qr_last_scanned" timestamp,
	"app_secret" text,
	"api_version" text DEFAULT 'v18.0',
	"business_portfolio_id" text,
	"verified_name" text,
	"quality_rating" text,
	"meta_status" text,
	"connected_at" timestamp,
	"connection_method" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "whatsapp_templates" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"template_id" text,
	"trigger_keyword" text,
	"message_body" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"category" text DEFAULT 'UTILITY' NOT NULL,
	"language" text DEFAULT 'en_US' NOT NULL,
	"header_text" text,
	"footer_text" text,
	"param_count" integer DEFAULT 0 NOT NULL,
	"trigger_event" text,
	"meta_template_id" text,
	"approval_status" text DEFAULT 'draft' NOT NULL,
	"rejection_reason" text,
	"submitted_to_meta" boolean DEFAULT false NOT NULL,
	"meta_submitted_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "site_settings" (
	"id" serial PRIMARY KEY NOT NULL,
	"site_name" text DEFAULT 'KDF NUTS' NOT NULL,
	"logo_path" text,
	"favicon_path" text,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "seo_settings" (
	"id" serial PRIMARY KEY NOT NULL,
	"google_verification_code" text,
	"robots_txt_content" text DEFAULT 'User-agent: *
Allow: /

Sitemap: /sitemap.xml',
	"site_noindex" boolean DEFAULT false NOT NULL,
	"sitemap_enabled" boolean DEFAULT true NOT NULL,
	"canonical_domain" text,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "blog_posts" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"slug" text NOT NULL,
	"content" text DEFAULT '' NOT NULL,
	"excerpt" text,
	"featured_image_path" text,
	"meta_title" text,
	"meta_description" text,
	"keywords" text,
	"tags" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"views" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "blog_posts_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "abandoned_checkouts" (
	"id" serial PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"user_id" integer,
	"customer_name" text,
	"phone" text,
	"email" text,
	"cart_items" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"subtotal" numeric(10, 2) DEFAULT '0' NOT NULL,
	"checkout_step" text DEFAULT 'cart' NOT NULL,
	"status" "abandoned_checkout_status" DEFAULT 'active' NOT NULL,
	"customer_address" text,
	"whatsapp_sent" boolean DEFAULT false NOT NULL,
	"email_sent" boolean DEFAULT false NOT NULL,
	"reminder_count" integer DEFAULT 0 NOT NULL,
	"reminder_sent_at" timestamp,
	"discount_applied" text,
	"last_activity" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"recovered_at" timestamp,
	CONSTRAINT "abandoned_checkouts_session_id_unique" UNIQUE("session_id")
);
--> statement-breakpoint
CREATE TABLE "user_addresses" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"label" text DEFAULT 'Home' NOT NULL,
	"name" text NOT NULL,
	"phone" text NOT NULL,
	"address" text NOT NULL,
	"area" text,
	"city" text NOT NULL,
	"postal_code" text,
	"country" text DEFAULT 'Pakistan' NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "announcements" (
	"id" serial PRIMARY KEY NOT NULL,
	"text" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"speed" integer DEFAULT 40,
	"bg_color" text DEFAULT '#c0392b',
	"text_color" text DEFAULT 'white',
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app_links" (
	"id" serial PRIMARY KEY NOT NULL,
	"android_link" text,
	"ios_link" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "footer_menu_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"menu_id" integer NOT NULL,
	"label" text NOT NULL,
	"link_type" text DEFAULT 'custom' NOT NULL,
	"link_value" text NOT NULL,
	"open_in_new_tab" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "footer_menus" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "footer_settings" (
	"id" serial PRIMARY KEY NOT NULL,
	"logo_path" text,
	"description" text,
	"address" text,
	"phone" text,
	"email" text,
	"copyright_text" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "policies" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"slug" text NOT NULL,
	"content" text DEFAULT '' NOT NULL,
	"meta_title" text,
	"meta_description" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "policies_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "social_links" (
	"id" serial PRIMARY KEY NOT NULL,
	"platform" text NOT NULL,
	"url" text NOT NULL,
	"icon" text DEFAULT 'link' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_settings" (
	"id" serial PRIMARY KEY NOT NULL,
	"openai_api_key" text DEFAULT '' NOT NULL,
	"openai_org_id" text DEFAULT '' NOT NULL,
	"ai_enabled" boolean DEFAULT false NOT NULL,
	"system_prompt" text DEFAULT 'You are an expert eCommerce sales and content expert for KDF NUTS, a premium dry fruits and nuts brand in Pakistan. You talk like a real human — warm, confident, and persuasive. You never sound robotic. You understand both English and Urdu naturally.' NOT NULL,
	"tone" varchar(50) DEFAULT 'professional' NOT NULL,
	"language" varchar(20) DEFAULT 'english' NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"primary_provider" varchar(30) DEFAULT 'openai' NOT NULL,
	"fallback_provider" varchar(30) DEFAULT '' NOT NULL,
	"gemini_api_key" text DEFAULT '' NOT NULL,
	"deepseek_api_key" text DEFAULT '' NOT NULL,
	"claude_api_key" text DEFAULT '' NOT NULL,
	"task_routing" jsonb DEFAULT '{"chat":"openai","content":"openai","seo":"openai","image":"gemini","whatsapp":"openai"}'::jsonb NOT NULL,
	"personality" varchar(50) DEFAULT 'professional' NOT NULL,
	"creativity_level" integer DEFAULT 70 NOT NULL,
	"response_length" varchar(20) DEFAULT 'medium' NOT NULL,
	"sales_aggressiveness" integer DEFAULT 60 NOT NULL,
	"human_like_level" integer DEFAULT 80 NOT NULL,
	"image_provider" varchar(30) DEFAULT 'openai' NOT NULL,
	"image_style" varchar(50) DEFAULT 'premium-ecommerce' NOT NULL,
	"auto_generate_images" boolean DEFAULT false NOT NULL,
	"image_quality" varchar(20) DEFAULT 'standard' NOT NULL,
	"brand_colors" text DEFAULT '#5FA800,#F58300' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "failed_orders" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer,
	"order_data" jsonb,
	"reason" text DEFAULT 'unknown' NOT NULL,
	"error_message" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "admin_notifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"message" text NOT NULL,
	"type" text DEFAULT 'order' NOT NULL,
	"is_read" boolean DEFAULT false NOT NULL,
	"order_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_leads" (
	"id" serial PRIMARY KEY NOT NULL,
	"session_id" text,
	"name" text NOT NULL,
	"phone" text NOT NULL,
	"email" text,
	"city" text,
	"source" text DEFAULT 'kdf_nuts' NOT NULL,
	"status" text DEFAULT 'new' NOT NULL,
	"visit_source" text,
	"device_info" jsonb,
	"interested_products" jsonb DEFAULT '[]'::jsonb,
	"cart_abandoned" jsonb DEFAULT '[]'::jsonb,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_sessions" (
	"id" serial PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"user_id" integer,
	"messages" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "chat_sessions_session_id_unique" UNIQUE("session_id")
);
--> statement-breakpoint
CREATE TABLE "product_reviews" (
	"id" serial PRIMARY KEY NOT NULL,
	"product_id" integer NOT NULL,
	"name" text NOT NULL,
	"email" text,
	"rating" integer NOT NULL,
	"comment" text NOT NULL,
	"images" jsonb DEFAULT '[]'::jsonb,
	"approved" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"to" text NOT NULL,
	"subject" text NOT NULL,
	"status" text DEFAULT 'sent' NOT NULL,
	"error_message" text,
	"order_id" integer,
	"order_number" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_settings" (
	"id" serial PRIMARY KEY NOT NULL,
	"email_enabled" boolean DEFAULT false NOT NULL,
	"smtp_host" text DEFAULT '' NOT NULL,
	"smtp_port" integer DEFAULT 587 NOT NULL,
	"smtp_user" text DEFAULT '' NOT NULL,
	"smtp_pass" text DEFAULT '' NOT NULL,
	"smtp_from" text DEFAULT '' NOT NULL,
	"order_confirm_enabled" boolean DEFAULT true NOT NULL,
	"order_confirm_subject" text DEFAULT 'Your KDF Nuts Order Confirmation' NOT NULL,
	"order_confirm_template" text DEFAULT '' NOT NULL,
	"order_paid_enabled" boolean DEFAULT true NOT NULL,
	"order_paid_subject" text DEFAULT 'Payment Confirmed — KDF Nuts Order #{{orderNumber}}' NOT NULL,
	"order_cancelled_enabled" boolean DEFAULT true NOT NULL,
	"order_cancelled_subject" text DEFAULT 'Your KDF Nuts Order Has Been Cancelled' NOT NULL,
	"courier_booked_enabled" boolean DEFAULT true NOT NULL,
	"courier_booked_subject" text DEFAULT 'Your Order Is Dispatched — Tracking #{{trackingId}}' NOT NULL,
	"rider_assigned_enabled" boolean DEFAULT true NOT NULL,
	"rider_assigned_subject" text DEFAULT 'Rider Assigned — Your KDF Nuts Order Is Coming' NOT NULL,
	"out_for_delivery_enabled" boolean DEFAULT true NOT NULL,
	"out_for_delivery_subject" text DEFAULT 'Your Order Is Out For Delivery Today!' NOT NULL,
	"delivered_enabled" boolean DEFAULT true NOT NULL,
	"delivered_subject" text DEFAULT 'Order Delivered — Thank You! 🎉' NOT NULL,
	"refund_enabled" boolean DEFAULT true NOT NULL,
	"refund_subject" text DEFAULT 'Refund Processed — KDF Nuts Order #{{orderNumber}}' NOT NULL,
	"invoice_enabled" boolean DEFAULT false NOT NULL,
	"invoice_subject" text DEFAULT 'Invoice for Order #{{orderNumber}}' NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shipping_rules" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"type" "shipping_rule_type" NOT NULL,
	"method_name" text DEFAULT 'Standard Delivery' NOT NULL,
	"delivery_time" text DEFAULT '2–3 business days' NOT NULL,
	"min_value" numeric(10, 2),
	"max_value" numeric(10, 2),
	"price" numeric(10, 2) DEFAULT '0' NOT NULL,
	"product_ids" jsonb DEFAULT '[]'::jsonb,
	"category_ids" jsonb DEFAULT '[]'::jsonb,
	"cities" jsonb DEFAULT '[]'::jsonb,
	"priority" integer DEFAULT 10 NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "header_settings" (
	"id" serial PRIMARY KEY NOT NULL,
	"logo_position" text DEFAULT 'left' NOT NULL,
	"show_search" boolean DEFAULT true NOT NULL,
	"search_width" integer DEFAULT 50 NOT NULL,
	"menu_position" text DEFAULT 'below' NOT NULL,
	"sticky_header" boolean DEFAULT true NOT NULL,
	"header_height" integer DEFAULT 64 NOT NULL,
	"primary_color" text DEFAULT '#16a34a' NOT NULL,
	"background_color" text DEFAULT '#ffffff' NOT NULL,
	"text_color" text DEFAULT '#111827' NOT NULL,
	"nav_bg_color" text DEFAULT '#16a34a' NOT NULL,
	"nav_text_color" text DEFAULT '#ffffff' NOT NULL,
	"show_top_bar" boolean DEFAULT true NOT NULL,
	"top_bar_text" text DEFAULT '🚚 Free delivery on orders above Rs. 1,500 — Order now!' NOT NULL,
	"top_bar_bg_color" text DEFAULT '#c53030' NOT NULL,
	"top_bar_text_color" text DEFAULT '#ffffff' NOT NULL,
	"top_bar_animation" text DEFAULT 'marquee' NOT NULL,
	"top_bar_speed" integer DEFAULT 30 NOT NULL,
	"top_bar_slides" text DEFAULT '[]' NOT NULL,
	"nav_items" text DEFAULT '[]' NOT NULL,
	"show_cart" boolean DEFAULT true NOT NULL,
	"show_account" boolean DEFAULT true NOT NULL,
	"show_track_order" boolean DEFAULT true NOT NULL,
	"show_location_selector" boolean DEFAULT true NOT NULL,
	"show_whatsapp" boolean DEFAULT false NOT NULL,
	"whatsapp_number" text DEFAULT '+92-300-0000000',
	"show_trust_strip" boolean DEFAULT true NOT NULL,
	"trust_strip_items" text DEFAULT '[]' NOT NULL,
	"show_mobile_search" boolean DEFAULT true NOT NULL,
	"show_sticky_bottom_bar" boolean DEFAULT true NOT NULL,
	"mobile_menu_type" text DEFAULT 'slide' NOT NULL,
	"show_mobile_categories" boolean DEFAULT true NOT NULL,
	"border_radius" integer DEFAULT 6 NOT NULL,
	"show_shadow" boolean DEFAULT true NOT NULL,
	"show_border" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bids" (
	"id" serial PRIMARY KEY NOT NULL,
	"product_id" integer NOT NULL,
	"bid_config_id" integer NOT NULL,
	"user_id" integer,
	"bidder_name" text NOT NULL,
	"bidder_phone" text NOT NULL,
	"bidder_email" text,
	"amount" numeric(10, 2) NOT NULL,
	"status" "bid_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_bid_config" (
	"id" serial PRIMARY KEY NOT NULL,
	"product_id" integer NOT NULL,
	"is_active" boolean DEFAULT false NOT NULL,
	"status" "bid_auction_status" DEFAULT 'draft' NOT NULL,
	"starting_price" numeric(10, 2) DEFAULT '0' NOT NULL,
	"current_bid" numeric(10, 2) DEFAULT '0' NOT NULL,
	"min_increment" numeric(10, 2) DEFAULT '50' NOT NULL,
	"reserve_price" numeric(10, 2),
	"buy_now_price" numeric(10, 2),
	"start_time" timestamp,
	"end_time" timestamp,
	"total_bids" integer DEFAULT 0 NOT NULL,
	"winner_bid_id" integer,
	"winner_notified" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "product_bid_config_product_id_unique" UNIQUE("product_id")
);
--> statement-breakpoint
CREATE TABLE "restock_requests" (
	"id" serial PRIMARY KEY NOT NULL,
	"product_id" integer NOT NULL,
	"name" text,
	"email" text NOT NULL,
	"phone" text,
	"notified_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "campaign_message_queue" (
	"id" serial PRIMARY KEY NOT NULL,
	"campaign_id" integer,
	"campaign_type" text DEFAULT 'whatsapp' NOT NULL,
	"customer_id" integer,
	"customer_name" text,
	"phone" text,
	"email" text,
	"message" text,
	"subject" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"scheduled_at" timestamp DEFAULT now() NOT NULL,
	"sent_at" timestamp,
	"error_message" text,
	"retries" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shopify_campaigns" (
	"id" serial PRIMARY KEY NOT NULL,
	"store_id" integer,
	"name" text NOT NULL,
	"message" text NOT NULL,
	"image_url" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"target_segment" text DEFAULT 'all' NOT NULL,
	"min_order_count" integer,
	"min_total_spent" numeric(10, 2),
	"include_abandoned" boolean DEFAULT false NOT NULL,
	"discount_code" text,
	"discount_message" text,
	"product_ids" jsonb,
	"button_shop_now" boolean DEFAULT false NOT NULL,
	"button_view_product" boolean DEFAULT false NOT NULL,
	"button_apply_discount" boolean DEFAULT false NOT NULL,
	"shop_now_url" text,
	"view_product_url" text,
	"total_sent" integer DEFAULT 0 NOT NULL,
	"total_delivered" integer DEFAULT 0 NOT NULL,
	"total_failed" integer DEFAULT 0 NOT NULL,
	"scheduled_at" timestamp,
	"started_at" timestamp,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shopify_customers" (
	"id" serial PRIMARY KEY NOT NULL,
	"store_id" integer DEFAULT 0 NOT NULL,
	"shopify_customer_id" text NOT NULL,
	"first_name" text,
	"last_name" text,
	"email" text,
	"phone" text,
	"city" text,
	"country" text,
	"total_orders" integer DEFAULT 0 NOT NULL,
	"total_spent" numeric(10, 2) DEFAULT '0',
	"currency" text DEFAULT 'PKR',
	"tags" text,
	"accepts_marketing" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"source" text DEFAULT 'shopify' NOT NULL,
	"last_order_at" timestamp,
	"shopify_created_at" timestamp,
	"synced_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "shopify_customers_shopify_customer_id_unique" UNIQUE("shopify_customer_id")
);
--> statement-breakpoint
CREATE TABLE "shopify_email_campaigns" (
	"id" serial PRIMARY KEY NOT NULL,
	"store_id" integer,
	"name" text NOT NULL,
	"subject" text NOT NULL,
	"from_name" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"target_segment" text DEFAULT 'all' NOT NULL,
	"min_order_count" integer,
	"min_total_spent" numeric(10, 2),
	"banner_image_url" text,
	"headline" text,
	"body_text" text DEFAULT '' NOT NULL,
	"discount_code" text,
	"discount_message" text,
	"product_title" text,
	"product_image_url" text,
	"product_url" text,
	"cta_button_text" text,
	"cta_button_url" text,
	"cta_button2_text" text,
	"cta_button2_url" text,
	"footer_text" text,
	"custom_html" text,
	"total_sent" integer DEFAULT 0 NOT NULL,
	"total_delivered" integer DEFAULT 0 NOT NULL,
	"total_failed" integer DEFAULT 0 NOT NULL,
	"total_opened" integer DEFAULT 0 NOT NULL,
	"total_clicked" integer DEFAULT 0 NOT NULL,
	"scheduled_at" timestamp,
	"started_at" timestamp,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shopify_email_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"campaign_id" integer NOT NULL,
	"customer_id" integer,
	"email" text NOT NULL,
	"customer_name" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"error_message" text,
	"sent_at" timestamp,
	"opened_at" timestamp,
	"clicked_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shopify_orders" (
	"id" serial PRIMARY KEY NOT NULL,
	"store_id" integer NOT NULL,
	"shopify_order_id" text NOT NULL,
	"order_number" text NOT NULL,
	"customer_name" text,
	"customer_email" text,
	"customer_phone" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"fulfillment_status" text,
	"financial_status" text,
	"currency" text DEFAULT 'PKR',
	"total_price" numeric(10, 2),
	"subtotal_price" numeric(10, 2),
	"total_tax" numeric(10, 2),
	"total_discounts" numeric(10, 2),
	"shipping_address" jsonb,
	"line_items" jsonb,
	"tags" text,
	"note" text,
	"tracking_number" text,
	"tracking_url" text,
	"wa_notification_sent" boolean DEFAULT false NOT NULL,
	"wa_last_message" text,
	"shopify_created_at" timestamp,
	"shopify_updated_at" timestamp,
	"synced_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "shopify_orders_shopify_order_id_unique" UNIQUE("shopify_order_id")
);
--> statement-breakpoint
CREATE TABLE "shopify_products" (
	"id" serial PRIMARY KEY NOT NULL,
	"store_id" integer NOT NULL,
	"shopify_product_id" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"vendor" text,
	"product_type" text,
	"status" text DEFAULT 'active',
	"tags" text,
	"image_url" text,
	"price" numeric(10, 2),
	"compare_at_price" numeric(10, 2),
	"inventory_quantity" integer DEFAULT 0,
	"sku" text,
	"variants" jsonb,
	"is_featured" boolean DEFAULT false NOT NULL,
	"badge" text,
	"is_recommended" boolean DEFAULT false NOT NULL,
	"recommend_priority" integer DEFAULT 0,
	"shopify_created_at" timestamp,
	"synced_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "shopify_products_shopify_product_id_unique" UNIQUE("shopify_product_id")
);
--> statement-breakpoint
CREATE TABLE "shopify_stores" (
	"id" serial PRIMARY KEY NOT NULL,
	"shop_domain" text NOT NULL,
	"access_token" text,
	"api_key" text,
	"api_secret" text,
	"webhook_secret" text,
	"store_name" text,
	"store_email" text,
	"currency" text DEFAULT 'PKR',
	"is_connected" boolean DEFAULT false NOT NULL,
	"sync_orders" boolean DEFAULT true NOT NULL,
	"sync_customers" boolean DEFAULT true NOT NULL,
	"sync_products" boolean DEFAULT true NOT NULL,
	"last_order_sync" timestamp,
	"last_customer_sync" timestamp,
	"last_product_sync" timestamp,
	"total_orders_synced" integer DEFAULT 0 NOT NULL,
	"total_customers_synced" integer DEFAULT 0 NOT NULL,
	"total_products_synced" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shopify_webhook_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"store_id" integer,
	"topic" text NOT NULL,
	"shopify_id" text,
	"payload" jsonb,
	"processed" boolean DEFAULT false NOT NULL,
	"error" text,
	"received_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wa_agent_notes" (
	"id" serial PRIMARY KEY NOT NULL,
	"conversation_id" integer NOT NULL,
	"phone" text NOT NULL,
	"agent_name" text NOT NULL,
	"note" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wa_conversations" (
	"id" serial PRIMARY KEY NOT NULL,
	"contact_phone" text NOT NULL,
	"contact_name" text,
	"contact_wa_id" text,
	"last_message" text,
	"last_message_at" timestamp,
	"unread_count" integer DEFAULT 0 NOT NULL,
	"bot_mode" text DEFAULT 'auto' NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"customer_user_id" integer,
	"assigned_to" text,
	"agent_name" text,
	"last_agent_at" timestamp,
	"internal_note" text,
	"is_starred" boolean DEFAULT false,
	"intent" text,
	"tags" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "wa_conversations_contact_phone_unique" UNIQUE("contact_phone")
);
--> statement-breakpoint
CREATE TABLE "wa_messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"conversation_id" integer NOT NULL,
	"wa_message_id" text,
	"direction" text NOT NULL,
	"type" text DEFAULT 'text' NOT NULL,
	"content" text,
	"media_url" text,
	"caption" text,
	"reaction" text,
	"status" text DEFAULT 'sent' NOT NULL,
	"is_bot" boolean DEFAULT false NOT NULL,
	"template_name" text,
	"agent_name" text,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "wa_webhook_failures" (
	"id" serial PRIMARY KEY NOT NULL,
	"payload" jsonb,
	"error" text,
	"signature" text,
	"retry_count" integer DEFAULT 0,
	"resolved" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wa_automation_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"rule_id" integer NOT NULL,
	"rule_name" text,
	"phone" text,
	"customer_name" text,
	"order_id" integer,
	"status" text DEFAULT 'sent' NOT NULL,
	"message" text,
	"error" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wa_automation_rules" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"trigger_type" text NOT NULL,
	"trigger_config" jsonb DEFAULT '{}'::jsonb,
	"condition_type" text DEFAULT 'always',
	"condition_config" jsonb DEFAULT '{}'::jsonb,
	"action_type" text DEFAULT 'send_wa' NOT NULL,
	"message_template" text,
	"template_name" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"run_count" integer DEFAULT 0 NOT NULL,
	"last_run_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wa_campaign_schedule" (
	"id" serial PRIMARY KEY NOT NULL,
	"campaign_id" integer NOT NULL,
	"scheduled_at" timestamp NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wa_cost_tracking" (
	"id" serial PRIMARY KEY NOT NULL,
	"date" text NOT NULL,
	"total_sent" integer DEFAULT 0 NOT NULL,
	"total_delivered" integer DEFAULT 0 NOT NULL,
	"total_failed" integer DEFAULT 0 NOT NULL,
	"utility_count" integer DEFAULT 0 NOT NULL,
	"marketing_count" integer DEFAULT 0 NOT NULL,
	"auth_count" integer DEFAULT 0 NOT NULL,
	"service_cost" numeric(10, 4) DEFAULT '0',
	"marketing_cost" numeric(10, 4) DEFAULT '0',
	"utility_cost" numeric(10, 4) DEFAULT '0',
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "wa_cost_tracking_date_unique" UNIQUE("date")
);
--> statement-breakpoint
CREATE TABLE "social_leads" (
	"id" serial PRIMARY KEY NOT NULL,
	"platform" text NOT NULL,
	"sender_id" text NOT NULL,
	"sender_name" text,
	"phone" text,
	"interest" text,
	"message_count" integer DEFAULT 1 NOT NULL,
	"first_seen_at" timestamp DEFAULT now() NOT NULL,
	"last_seen_at" timestamp DEFAULT now() NOT NULL,
	"is_converted" boolean DEFAULT false NOT NULL,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "social_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"platform" text NOT NULL,
	"type" text NOT NULL,
	"sender_id" text,
	"sender_name" text,
	"message_id" text,
	"post_id" text,
	"comment_id" text,
	"incoming_text" text,
	"ai_reply" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"error" text,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "social_settings" (
	"id" serial PRIMARY KEY NOT NULL,
	"is_enabled" boolean DEFAULT false NOT NULL,
	"ig_enabled" boolean DEFAULT true NOT NULL,
	"fb_enabled" boolean DEFAULT true NOT NULL,
	"page_access_token" text,
	"ig_business_account_id" text,
	"fb_page_id" text,
	"webhook_verify_token" text DEFAULT 'kdfnuts_social_token',
	"ai_model" text DEFAULT 'gpt-4o-mini' NOT NULL,
	"system_prompt" text DEFAULT 'You are an AI Customer Support & Sales Assistant for KDF NUTS, a premium nuts and dry fruits brand in Pakistan. Reply like a friendly, knowledgeable human — never robotic. Keep replies short and clear. Use the customer''s name if available. Mix English and Urdu naturally (Roman Urdu is fine). Always try to convert the conversation into a sale. For product queries give name, price and benefits. For order intent, ask for name, address, phone. For comments, reply briefly and push them to DM. Never argue, never spam links.' NOT NULL,
	"comment_reply_enabled" boolean DEFAULT true NOT NULL,
	"dm_reply_enabled" boolean DEFAULT true NOT NULL,
	"auto_follow_up_dm" boolean DEFAULT true NOT NULL,
	"reply_delay_sec" integer DEFAULT 10 NOT NULL,
	"max_daily_replies" integer DEFAULT 200 NOT NULL,
	"connection_method" text,
	"fb_page_name" text,
	"ig_username" text,
	"connected_at" timestamp,
	"token_expires_at" timestamp,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" serial PRIMARY KEY NOT NULL,
	"invoice_number" text NOT NULL,
	"customer_name" text,
	"customer_phone" text,
	"customer_email" text,
	"amount" numeric(12, 2) NOT NULL,
	"description" text,
	"notes" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"due_date" timestamp,
	"meezan_order_id" text,
	"payment_url" text,
	"invoice_url" text,
	"sent_at" timestamp,
	"sent_via" text,
	"paid_at" timestamp,
	"platform_source" text DEFAULT 'admin',
	"is_live" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "invoices_invoice_number_unique" UNIQUE("invoice_number")
);
--> statement-breakpoint
CREATE TABLE "meezan_audit_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"txn_id" integer,
	"action" text NOT NULL,
	"performed_by" text,
	"payload" jsonb,
	"response" jsonb,
	"ip" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "meezan_settings" (
	"id" serial PRIMARY KEY NOT NULL,
	"environment" text DEFAULT 'sandbox' NOT NULL,
	"sandbox_username" text,
	"sandbox_password" text,
	"sandbox_merchant_id" text,
	"live_username" text,
	"live_password" text,
	"live_merchant_id" text,
	"return_url" text,
	"fail_url" text,
	"callback_url" text,
	"webhook_secret" text,
	"is_active" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "meezan_transactions" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" integer,
	"invoice_number" text,
	"meezan_order_id" text,
	"meezan_txn_id" text,
	"amount" numeric(12, 2) NOT NULL,
	"refunded_amount" numeric(12, 2) DEFAULT '0' NOT NULL,
	"currency" text DEFAULT 'PKR' NOT NULL,
	"description" text,
	"customer_name" text,
	"customer_phone" text,
	"customer_email" text,
	"payment_method" text,
	"card_mask" text,
	"status" "meezan_txn_status" DEFAULT 'initiated' NOT NULL,
	"error_code" text,
	"error_message" text,
	"refund_reason" text,
	"refund_txn_id" text,
	"refunded_at" timestamp,
	"return_url" text,
	"fail_url" text,
	"register_response" jsonb,
	"status_response" jsonb,
	"callback_payload" jsonb,
	"is_live" boolean DEFAULT false NOT NULL,
	"platform_source" text,
	"external_ref" text,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "meezan_transactions_meezan_order_id_unique" UNIQUE("meezan_order_id")
);
--> statement-breakpoint
CREATE TABLE "branches" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"city" text NOT NULL,
	"address" text,
	"phone" text,
	"whatsapp_number" text,
	"manager_name" text,
	"manager_phone" text,
	"email" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"is_head_office" boolean DEFAULT false NOT NULL,
	"settings" jsonb DEFAULT '{}'::jsonb,
	"monthly_target" numeric(12, 2),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "branches_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "branch_audit_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"branch_id" integer NOT NULL,
	"invoice_id" integer,
	"user_id" integer,
	"user_name" text,
	"action" text NOT NULL,
	"old_data" jsonb,
	"new_data" jsonb,
	"note" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "branch_customers" (
	"id" serial PRIMARY KEY NOT NULL,
	"branch_id" integer NOT NULL,
	"name" text NOT NULL,
	"phone" text NOT NULL,
	"email" text,
	"address" text,
	"total_orders" integer DEFAULT 0 NOT NULL,
	"total_spent" numeric(12, 2) DEFAULT '0' NOT NULL,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "branch_invoices" (
	"id" serial PRIMARY KEY NOT NULL,
	"branch_id" integer NOT NULL,
	"created_by_user_id" integer,
	"invoice_no" text NOT NULL,
	"type" text DEFAULT 'invoice' NOT NULL,
	"status" text DEFAULT 'completed' NOT NULL,
	"customer_id" integer,
	"customer_name" text,
	"customer_phone" text,
	"customer_address" text,
	"supplier_name" text,
	"supplier_phone" text,
	"supplier_city" text,
	"items" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"subtotal" numeric(12, 2) DEFAULT '0' NOT NULL,
	"discount_pct" numeric(5, 2) DEFAULT '0' NOT NULL,
	"discount_amt" numeric(12, 2) DEFAULT '0' NOT NULL,
	"shipping" numeric(12, 2) DEFAULT '0' NOT NULL,
	"tax_rate" numeric(5, 2) DEFAULT '0' NOT NULL,
	"tax_amt" numeric(12, 2) DEFAULT '0' NOT NULL,
	"grand_total" numeric(12, 2) DEFAULT '0' NOT NULL,
	"payment_method" text DEFAULT 'cash' NOT NULL,
	"payment_status" text DEFAULT 'unpaid' NOT NULL,
	"paid_amount" numeric(12, 2) DEFAULT '0' NOT NULL,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "branch_returns" (
	"id" serial PRIMARY KEY NOT NULL,
	"branch_id" integer NOT NULL,
	"original_invoice_id" integer NOT NULL,
	"return_invoice_no" text NOT NULL,
	"processed_by_user_id" integer,
	"processed_by_name" text,
	"return_type" text DEFAULT 'full_return' NOT NULL,
	"items" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"exchange_items" jsonb DEFAULT '[]'::jsonb,
	"return_amount" numeric(12, 2) DEFAULT '0' NOT NULL,
	"store_credit" numeric(12, 2) DEFAULT '0' NOT NULL,
	"refund_method" text DEFAULT 'cash',
	"reason" text,
	"notes" text,
	"status" text DEFAULT 'completed' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "branch_users" (
	"id" serial PRIMARY KEY NOT NULL,
	"branch_id" integer NOT NULL,
	"username" text NOT NULL,
	"password_hash" text NOT NULL,
	"name" text NOT NULL,
	"phone" text,
	"email" text,
	"role" text DEFAULT 'cashier' NOT NULL,
	"permissions" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "branch_users_username_unique" UNIQUE("username")
);
--> statement-breakpoint
CREATE TABLE "erp_settings" (
	"id" serial PRIMARY KEY NOT NULL,
	"section" text NOT NULL,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"updated_by" integer,
	CONSTRAINT "erp_settings_section_unique" UNIQUE("section")
);
--> statement-breakpoint
CREATE TABLE "branch_products" (
	"id" serial PRIMARY KEY NOT NULL,
	"branch_id" integer,
	"item_code" text NOT NULL,
	"name" text NOT NULL,
	"unit" text DEFAULT 'KG' NOT NULL,
	"category" text,
	"purchase_price" numeric(12, 2),
	"sale_price" numeric(12, 2),
	"stock_qty" numeric(12, 3) DEFAULT '0' NOT NULL,
	"low_stock_threshold" numeric(12, 3) DEFAULT '1',
	"is_active" boolean DEFAULT true NOT NULL,
	"barcode" text,
	"description" text,
	"image_url" text,
	"tags" jsonb DEFAULT '[]'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stock_movements" (
	"id" serial PRIMARY KEY NOT NULL,
	"product_id" integer NOT NULL,
	"branch_id" integer,
	"type" text NOT NULL,
	"qty" numeric(12, 3) NOT NULL,
	"balance_before" numeric(12, 3),
	"balance_after" numeric(12, 3),
	"reference" text,
	"reference_type" text,
	"notes" text,
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "video_banners" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"subtitle" text,
	"cf_stream_id" text,
	"cf_account_id" text,
	"youtube_url" text,
	"youtube_thumbnail" text,
	"direct_video_url" text,
	"mobile_video_url" text,
	"fallback_image_url" text,
	"mobile_fallback_image_url" text,
	"autoplay" boolean DEFAULT true NOT NULL,
	"muted" boolean DEFAULT true NOT NULL,
	"loop" boolean DEFAULT true NOT NULL,
	"show_controls" boolean DEFAULT false NOT NULL,
	"cta_buttons" jsonb DEFAULT '[]'::jsonb,
	"platform" text DEFAULT 'both' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"is_priority" boolean DEFAULT false NOT NULL,
	"start_date" timestamp,
	"end_date" timestamp,
	"overlay_opacity" integer DEFAULT 50,
	"text_position" text DEFAULT 'left',
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mobile_reels" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"cf_stream_id" text,
	"cf_account_id" text,
	"direct_video_url" text,
	"instagram_url" text,
	"youtube_url" text,
	"thumbnail_url" text,
	"autoplay" boolean DEFAULT true NOT NULL,
	"muted" boolean DEFAULT true NOT NULL,
	"loop" boolean DEFAULT true NOT NULL,
	"duration" integer,
	"cta_label" text,
	"cta_url" text,
	"linked_product_id" integer,
	"category" text DEFAULT 'general',
	"sort_order" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"view_count" integer DEFAULT 0 NOT NULL,
	"like_count" integer DEFAULT 0 NOT NULL,
	"start_date" timestamp,
	"end_date" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "google_indexing_settings" (
	"id" serial PRIMARY KEY NOT NULL,
	"service_account_json" text,
	"site_url" text,
	"auto_index_enabled" boolean DEFAULT false NOT NULL,
	"daily_quota_used" integer DEFAULT 0 NOT NULL,
	"quota_reset_date" text,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "indexing_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"url" text NOT NULL,
	"content_type" text NOT NULL,
	"action" text DEFAULT 'URL_UPDATED' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"google_response" text,
	"error_message" text,
	"triggered_by" text DEFAULT 'auto' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "admin_activity_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer,
	"user_email" text,
	"user_name" text,
	"action" text NOT NULL,
	"resource" text,
	"resource_id" text,
	"details" text,
	"old_data" jsonb,
	"new_data" jsonb,
	"ip_address" text,
	"user_agent" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "admin_permissions" (
	"key" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"module" text NOT NULL,
	"description" text
);
--> statement-breakpoint
CREATE TABLE "admin_role_permissions" (
	"role_id" integer NOT NULL,
	"permission_key" text NOT NULL,
	CONSTRAINT "admin_role_permissions_role_id_permission_key_pk" PRIMARY KEY("role_id","permission_key")
);
--> statement-breakpoint
CREATE TABLE "admin_roles" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	"is_system" boolean DEFAULT false NOT NULL,
	"color" text DEFAULT '#6366f1',
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "admin_roles_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "admin_user_roles" (
	"user_id" integer NOT NULL,
	"role_id" integer NOT NULL,
	CONSTRAINT "admin_user_roles_user_id_role_id_pk" PRIMARY KEY("user_id","role_id")
);
--> statement-breakpoint
CREATE TABLE "admin_users" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"phone" text,
	"password_hash" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"is_super" boolean DEFAULT false NOT NULL,
	"avatar_url" text,
	"last_login_at" timestamp,
	"last_login_ip" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "admin_users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "google_merchant_settings" (
	"id" serial PRIMARY KEY NOT NULL,
	"merchant_id" text DEFAULT '' NOT NULL,
	"store_name" text DEFAULT 'KDF NUTS' NOT NULL,
	"store_url" text DEFAULT '' NOT NULL,
	"currency" text DEFAULT 'PKR' NOT NULL,
	"country" text DEFAULT 'PK' NOT NULL,
	"language" text DEFAULT 'en' NOT NULL,
	"brand" text DEFAULT 'KDF NUTS' NOT NULL,
	"product_category" text DEFAULT 'Food, Beverages & Tobacco > Food Items > Nuts & Seeds' NOT NULL,
	"auto_sync_enabled" boolean DEFAULT false NOT NULL,
	"feed_enabled" boolean DEFAULT true NOT NULL,
	"last_sync_at" timestamp,
	"last_sync_count" integer DEFAULT 0 NOT NULL,
	"last_sync_error" text,
	"ga_tracking_id" text DEFAULT '' NOT NULL,
	"gtm_container_id" text DEFAULT '' NOT NULL,
	"search_console_url" text DEFAULT '' NOT NULL,
	"feed_settings" jsonb DEFAULT '{"includeOutOfStock":false,"includeVariants":true,"minPrice":0,"maxProducts":1000,"customLabel":""}'::jsonb NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "merchant_sync_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"action" text NOT NULL,
	"product_count" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'success' NOT NULL,
	"details" jsonb,
	"error" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "saas_activity_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer,
	"actor_type" text NOT NULL,
	"actor_id" integer,
	"action" text NOT NULL,
	"entity" text,
	"entity_id" text,
	"meta" jsonb DEFAULT '{}'::jsonb,
	"ip" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "saas_plans" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"tier" text DEFAULT 'starter' NOT NULL,
	"description" text,
	"price_monthly" numeric(10, 2) DEFAULT '0' NOT NULL,
	"price_yearly" numeric(10, 2) DEFAULT '0' NOT NULL,
	"currency" text DEFAULT 'PKR' NOT NULL,
	"features" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL,
	"badge_label" text,
	"color" text DEFAULT '#6366f1',
	"trial_days" integer DEFAULT 14 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "saas_plans_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "saas_super_admins" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_login_at" timestamp,
	"settings" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "saas_super_admins_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "saas_tenants" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"plan_id" integer,
	"status" text DEFAULT 'trial' NOT NULL,
	"industry" text DEFAULT 'other' NOT NULL,
	"store_name" text NOT NULL,
	"store_slug" text NOT NULL,
	"logo_url" text,
	"favicon_url" text,
	"custom_domain" text,
	"domain_verified" boolean DEFAULT false NOT NULL,
	"subdomain" text,
	"settings" jsonb DEFAULT '{}'::jsonb,
	"contact" jsonb DEFAULT '{}'::jsonb,
	"billing" jsonb DEFAULT '{}'::jsonb,
	"trial_ends_at" timestamp,
	"suspended_at" timestamp,
	"suspend_reason" text,
	"owner_name" text,
	"owner_phone" text,
	"notes" text,
	"feature_overrides" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "saas_tenants_slug_unique" UNIQUE("slug"),
	CONSTRAINT "saas_tenants_email_unique" UNIQUE("email"),
	CONSTRAINT "saas_tenants_store_slug_unique" UNIQUE("store_slug"),
	CONSTRAINT "saas_tenants_subdomain_unique" UNIQUE("subdomain")
);
--> statement-breakpoint
CREATE TABLE "saas_theme_settings" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"template_id" text DEFAULT 'default' NOT NULL,
	"primary_color" text DEFAULT '#16a34a' NOT NULL,
	"accent_color" text DEFAULT '#15803d' NOT NULL,
	"bg_color" text DEFAULT '#ffffff' NOT NULL,
	"text_color" text DEFAULT '#111827' NOT NULL,
	"font_family" text DEFAULT 'Inter' NOT NULL,
	"border_radius" text DEFAULT 'md' NOT NULL,
	"header_style" text DEFAULT 'default' NOT NULL,
	"hero_style" text DEFAULT 'banner' NOT NULL,
	"product_card_style" text DEFAULT 'default' NOT NULL,
	"show_reviews" boolean DEFAULT true NOT NULL,
	"show_wishlist" boolean DEFAULT true NOT NULL,
	"show_chat" boolean DEFAULT true NOT NULL,
	"show_banner" boolean DEFAULT true NOT NULL,
	"custom_css" text,
	"custom_js" text,
	"sections" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "saas_theme_settings_tenant_id_unique" UNIQUE("tenant_id")
);
--> statement-breakpoint
ALTER TABLE "rider_cod_settlements" ADD CONSTRAINT "rider_cod_settlements_rider_id_riders_id_fk" FOREIGN KEY ("rider_id") REFERENCES "public"."riders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rider_deliveries" ADD CONSTRAINT "rider_deliveries_rider_id_riders_id_fk" FOREIGN KEY ("rider_id") REFERENCES "public"."riders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_addresses" ADD CONSTRAINT "user_addresses_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "branch_audit_logs" ADD CONSTRAINT "branch_audit_logs_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "branch_audit_logs" ADD CONSTRAINT "branch_audit_logs_invoice_id_branch_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."branch_invoices"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "branch_audit_logs" ADD CONSTRAINT "branch_audit_logs_user_id_branch_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."branch_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "branch_customers" ADD CONSTRAINT "branch_customers_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "branch_invoices" ADD CONSTRAINT "branch_invoices_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "branch_invoices" ADD CONSTRAINT "branch_invoices_created_by_user_id_branch_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."branch_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "branch_invoices" ADD CONSTRAINT "branch_invoices_customer_id_branch_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."branch_customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "branch_returns" ADD CONSTRAINT "branch_returns_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "branch_returns" ADD CONSTRAINT "branch_returns_original_invoice_id_branch_invoices_id_fk" FOREIGN KEY ("original_invoice_id") REFERENCES "public"."branch_invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "branch_returns" ADD CONSTRAINT "branch_returns_processed_by_user_id_branch_users_id_fk" FOREIGN KEY ("processed_by_user_id") REFERENCES "public"."branch_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "branch_users" ADD CONSTRAINT "branch_users_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_role_permissions" ADD CONSTRAINT "admin_role_permissions_role_id_admin_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."admin_roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_user_roles" ADD CONSTRAINT "admin_user_roles_user_id_admin_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."admin_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_user_roles" ADD CONSTRAINT "admin_user_roles_role_id_admin_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."admin_roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saas_activity_logs" ADD CONSTRAINT "saas_activity_logs_tenant_id_saas_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."saas_tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saas_tenants" ADD CONSTRAINT "saas_tenants_plan_id_saas_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."saas_plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saas_theme_settings" ADD CONSTRAINT "saas_theme_settings_tenant_id_saas_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."saas_tenants"("id") ON DELETE cascade ON UPDATE no action;