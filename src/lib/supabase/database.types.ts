
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "public": {
          Tables: {
            "ai_reply_drafts": {
                  Row: {
                    "body": string,"checkin_id": string | null,"client_id": string,"closed_at": string | null,"created_at": string,"id": string,"last_message_id": string | null,"learned_at": string | null,"sent_by": string | null,"sent_text": string | null,"source": string,"status": string
                  }
                  ComputedFields: never
                  Insert: {
                    "body": string,"checkin_id"?: string | null,"client_id": string,"closed_at"?: string | null,"created_at"?: string,"id"?: string,"last_message_id"?: string | null,"learned_at"?: string | null,"sent_by"?: string | null,"sent_text"?: string | null,"source": string,"status"?: string
                  }
                  Update: {
                    "body"?: string,"checkin_id"?: string | null,"client_id"?: string,"closed_at"?: string | null,"created_at"?: string,"id"?: string,"last_message_id"?: string | null,"learned_at"?: string | null,"sent_by"?: string | null,"sent_text"?: string | null,"source"?: string,"status"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "ai_reply_drafts_checkin_id_fkey"
      columns: ["checkin_id"]
isOneToOne: true
      referencedRelation: "checkins"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "ai_reply_drafts_client_id_fkey"
      columns: ["client_id"]
isOneToOne: false
      referencedRelation: "clients"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "ai_reply_drafts_last_message_id_fkey"
      columns: ["last_message_id"]
isOneToOne: false
      referencedRelation: "messages"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "ai_reply_drafts_sent_by_fkey"
      columns: ["sent_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"ai_requests": {
                  Row: {
                    "client_id": string | null,"cost_eur": number,"created_at": string,"created_by": string | null,"id": string,"input_tokens": number,"kind": string,"model": string,"output_tokens": number
                  }
                  ComputedFields: never
                  Insert: {
                    "client_id"?: string | null,"cost_eur"?: number,"created_at"?: string,"created_by"?: string | null,"id"?: string,"input_tokens"?: number,"kind": string,"model": string,"output_tokens"?: number
                  }
                  Update: {
                    "client_id"?: string | null,"cost_eur"?: number,"created_at"?: string,"created_by"?: string | null,"id"?: string,"input_tokens"?: number,"kind"?: string,"model"?: string,"output_tokens"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "ai_requests_client_id_fkey"
      columns: ["client_id"]
isOneToOne: false
      referencedRelation: "clients"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "ai_requests_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"app_settings": {
                  Row: {
                    "ai_lessons": string,"ai_lessons_updated_at": string | null,"ai_monthly_budget_eur": number,"ai_reply_lessons": string,"ai_reply_lessons_updated_at": string | null,"business_name": string,"coaching_method": string,"id": number,"legal_address": string,"legal_name": string,"legal_tax_id": string,"payment_message": string,"privacy_pec": string, "privacy_email": string,"reminder_days": number,"staff_emails": boolean,"client_emails": boolean,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "ai_lessons"?: string,"ai_lessons_updated_at"?: string | null,"ai_monthly_budget_eur"?: number,"ai_reply_lessons"?: string,"ai_reply_lessons_updated_at"?: string | null,"business_name"?: string,"coaching_method"?: string,"id"?: number,"legal_address"?: string,"legal_name"?: string,"legal_tax_id"?: string,"payment_message"?: string,"privacy_pec"?: string, "privacy_email"?: string,"reminder_days"?: number,"staff_emails"?: boolean,"client_emails"?: boolean,"updated_at"?: string
                  }
                  Update: {
                    "ai_lessons"?: string,"ai_lessons_updated_at"?: string | null,"ai_monthly_budget_eur"?: number,"ai_reply_lessons"?: string,"ai_reply_lessons_updated_at"?: string | null,"business_name"?: string,"coaching_method"?: string,"id"?: number,"legal_address"?: string,"legal_name"?: string,"legal_tax_id"?: string,"payment_message"?: string,"privacy_pec"?: string, "privacy_email"?: string,"reminder_days"?: number,"staff_emails"?: boolean,"client_emails"?: boolean,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"app_secrets": {
                  Row: {
                    "created_at": string,"name": string,"value": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"name": string,"value": string
                  }
                  Update: {
                    "created_at"?: string,"name"?: string,"value"?: string
                  }
                  Relationships: []
                },"backup_runs": {
                  Row: {
                    "db_bytes": number | null,"files_bytes": number | null,"finished_at": string,"id": number,"message": string,"ok": boolean,"tables": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "db_bytes"?: number | null,"files_bytes"?: number | null,"finished_at"?: string,"id"?: never,"message"?: string,"ok": boolean,"tables"?: number | null
                  }
                  Update: {
                    "db_bytes"?: number | null,"files_bytes"?: number | null,"finished_at"?: string,"id"?: never,"message"?: string,"ok"?: boolean,"tables"?: number | null
                  }
                  Relationships: [
                    
                  ]
                },"chat_reads": {
                  Row: {
                    "client_id": string,"last_read_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "client_id": string,"last_read_at"?: string,"user_id": string
                  }
                  Update: {
                    "client_id"?: string,"last_read_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "chat_reads_client_id_fkey"
      columns: ["client_id"]
isOneToOne: false
      referencedRelation: "clients"
      referencedColumns: ["id"]
    }
                  ]
                },"checkins": {
                  Row: {
                    "adherence": number,"client_id": string,"coach_reply": string,"flag_reasons": (string)[],"flagged": boolean,"id": string,"issues": string,"request": string,"reviewed_at": string | null,"sleep": number,"stress": number,"submitted_at": string,"training": number,"week_start": string
                  }
                  ComputedFields: never
                  Insert: {
                    "adherence": number,"client_id": string,"coach_reply"?: string,"flag_reasons"?: (string)[],"flagged"?: boolean,"id"?: string,"issues"?: string,"request"?: string,"reviewed_at"?: string | null,"sleep": number,"stress": number,"submitted_at"?: string,"training": number,"week_start": string
                  }
                  Update: {
                    "adherence"?: number,"client_id"?: string,"coach_reply"?: string,"flag_reasons"?: (string)[],"flagged"?: boolean,"id"?: string,"issues"?: string,"request"?: string,"reviewed_at"?: string | null,"sleep"?: number,"stress"?: number,"submitted_at"?: string,"training"?: number,"week_start"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "checkins_client_id_fkey"
      columns: ["client_id"]
isOneToOne: false
      referencedRelation: "clients"
      referencedColumns: ["id"]
    }
                  ]
                },"check_photos": {
                  Row: {
                    "check_id": string,"client_id": string,"created_at": string,"created_by": string | null,"height": number | null,"id": string,"path": string,"size_bytes": number | null,"sort_order": number,"thumb_path": string,"width": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "check_id": string,"client_id": string,"created_at"?: string,"created_by"?: string | null,"height"?: number | null,"id"?: string,"path": string,"size_bytes"?: number | null,"sort_order"?: number,"thumb_path": string,"width"?: number | null
                  }
                  Update: {
                    "check_id"?: string,"client_id"?: string,"created_at"?: string,"created_by"?: string | null,"height"?: number | null,"id"?: string,"path"?: string,"size_bytes"?: number | null,"sort_order"?: number,"thumb_path"?: string,"width"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "check_photos_check_id_fkey"
      columns: ["check_id"]
isOneToOne: false
      referencedRelation: "checks"
      referencedColumns: ["id"]
    },
                    {
      foreignKeyName: "check_photos_client_id_fkey"
      columns: ["client_id"]
isOneToOne: false
      referencedRelation: "clients"
      referencedColumns: ["id"]
    }
                  ]
                },"checks": {
                  Row: {
                    "age_years": number | null,"body_fat_pct": number | null,"imported": boolean, "body_fat_formula": string | null,"check_date": string | null,"circumferences": NonNullable<Json>,"client_id": string,"created_at": string,"created_by": string | null,"fat_mass_kg": number | null,"id": string,"lean_mass_kg": number | null,"notes_next_phase": string,"order_hint": string | null,"sequence": number | null,"sex": string | null,"skinfold_sum_mm": number | null,"skinfolds": NonNullable<Json>,"strength_tests": NonNullable<Json>,"tests_text": string,"visible_to_client": boolean,"weight_kg": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "age_years"?: number | null,"body_fat_pct"?: number | null,"imported"?: boolean, "body_fat_formula"?: string | null,"check_date"?: string | null,"circumferences"?: NonNullable<Json>,"client_id": string,"created_at"?: string,"created_by"?: string | null,"fat_mass_kg"?: number | null,"id"?: string,"lean_mass_kg"?: number | null,"notes_next_phase"?: string,"order_hint"?: string | null,"sequence"?: number | null,"sex"?: string | null,"skinfold_sum_mm"?: number | null,"skinfolds"?: NonNullable<Json>,"strength_tests"?: NonNullable<Json>,"tests_text"?: string,"visible_to_client"?: boolean,"weight_kg"?: number | null
                  }
                  Update: {
                    "age_years"?: number | null,"body_fat_pct"?: number | null,"imported"?: boolean, "body_fat_formula"?: string | null,"check_date"?: string | null,"circumferences"?: NonNullable<Json>,"client_id"?: string,"created_at"?: string,"created_by"?: string | null,"fat_mass_kg"?: number | null,"id"?: string,"lean_mass_kg"?: number | null,"notes_next_phase"?: string,"order_hint"?: string | null,"sequence"?: number | null,"sex"?: string | null,"skinfold_sum_mm"?: number | null,"skinfolds"?: NonNullable<Json>,"strength_tests"?: NonNullable<Json>,"tests_text"?: string,"visible_to_client"?: boolean,"weight_kg"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "checks_client_id_fkey"
      columns: ["client_id"]
isOneToOne: false
      referencedRelation: "clients"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "checks_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"client_private_notes": {
                  Row: {
                    "client_id": string,"notes": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "client_id": string,"notes"?: string,"updated_at"?: string
                  }
                  Update: {
                    "client_id"?: string,"notes"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "client_private_notes_client_id_fkey"
      columns: ["client_id"]
isOneToOne: true
      referencedRelation: "clients"
      referencedColumns: ["id"]
    }
                  ]
                },"client_ai_profiles": {
                  Row: {
                    "auto_note": string,"client_id": string,"intensity_techniques": boolean | null,"notes": string,"reply_lessons": string,"running_level": string | null,"session_minutes": number | null,"squat_share": number | null,"strength_level": string | null,"updated_at": string,"vertical_push": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "auto_note"?: string,"client_id": string,"intensity_techniques"?: boolean | null,"notes"?: string,"reply_lessons"?: string,"running_level"?: string | null,"session_minutes"?: number | null,"squat_share"?: number | null,"strength_level"?: string | null,"updated_at"?: string,"vertical_push"?: string | null
                  }
                  Update: {
                    "auto_note"?: string,"client_id"?: string,"intensity_techniques"?: boolean | null,"notes"?: string,"reply_lessons"?: string,"running_level"?: string | null,"session_minutes"?: number | null,"squat_share"?: number | null,"strength_level"?: string | null,"updated_at"?: string,"vertical_push"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "client_ai_profiles_client_id_fkey"
      columns: ["client_id"]
isOneToOne: true
      referencedRelation: "clients"
      referencedColumns: ["id"]
    }
                  ]
                },"client_projects": {
                  Row: {
                    "client_id": string,"data": NonNullable<Json>,"updated_at": string,"updated_by": string | null,"visible": boolean
                  }
                  ComputedFields: never
                  Insert: {
                    "client_id": string,"data"?: NonNullable<Json>,"updated_at"?: string,"updated_by"?: string | null,"visible"?: boolean
                  }
                  Update: {
                    "client_id"?: string,"data"?: NonNullable<Json>,"updated_at"?: string,"updated_by"?: string | null,"visible"?: boolean
                  }
                  Relationships: [
                    {
      foreignKeyName: "client_projects_client_id_fkey"
      columns: ["client_id"]
isOneToOne: true
      referencedRelation: "clients"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "client_projects_updated_by_fkey"
      columns: ["updated_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"clients": {
                  Row: {
                    "archived_at": string | null,"birth_date": string | null,"coach_id": string | null,"consent_source": string | null,"created_at": string,"email": string | null,"first_name": string,"goals": string,"health_consent_at": string | null,"id": string,"last_name": string,"phase_weeks": number | null,"phone": string | null,"privacy_accepted_at": string | null,"privacy_version": string | null,"sex": string | null,"instagram_consent_at": string | null, "free": boolean, "skinfold_formula": string | null, "extra_sessions_adjust": number, "pt_count_from": string | null, "pt_session_price": number | null, "pt_baseline_at": string | null, "pt_baseline_left": number | null, "credit_adjust": number,"pt_credit_adjust": number,"start_date": string,"status": string,"user_id": string | null,"weekly_checkin": boolean
                  }
                  ComputedFields: never
                  Insert: {
                    "archived_at"?: string | null,"birth_date"?: string | null,"coach_id"?: string | null,"consent_source"?: string | null,"created_at"?: string,"email"?: string | null,"first_name": string,"goals"?: string,"health_consent_at"?: string | null,"id"?: string,"last_name"?: string,"phase_weeks"?: number | null,"phone"?: string | null,"privacy_accepted_at"?: string | null,"privacy_version"?: string | null,"sex"?: string | null,"instagram_consent_at"?: string | null, "free"?: boolean, "skinfold_formula"?: string | null, "extra_sessions_adjust"?: number, "pt_count_from"?: string | null, "pt_session_price"?: number | null, "pt_baseline_at"?: string | null, "pt_baseline_left"?: number | null, "credit_adjust"?: number,"pt_credit_adjust"?: number,"start_date"?: string,"status"?: string,"user_id"?: string | null,"weekly_checkin"?: boolean
                  }
                  Update: {
                    "archived_at"?: string | null,"birth_date"?: string | null,"coach_id"?: string | null,"consent_source"?: string | null,"created_at"?: string,"email"?: string | null,"first_name"?: string,"goals"?: string,"health_consent_at"?: string | null,"id"?: string,"last_name"?: string,"phase_weeks"?: number | null,"phone"?: string | null,"privacy_accepted_at"?: string | null,"privacy_version"?: string | null,"sex"?: string | null,"instagram_consent_at"?: string | null, "free"?: boolean, "skinfold_formula"?: string | null, "extra_sessions_adjust"?: number, "pt_count_from"?: string | null, "pt_session_price"?: number | null, "pt_baseline_at"?: string | null, "pt_baseline_left"?: number | null, "credit_adjust"?: number,"pt_credit_adjust"?: number,"start_date"?: string,"status"?: string,"user_id"?: string | null,"weekly_checkin"?: boolean
                  }
                  Relationships: [
                    {
      foreignKeyName: "clients_coach_id_fkey"
      columns: ["coach_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"exercise_logs": {
                  Row: {
                    "client_id": string,"created_at": string,"exercise_id": string | null,"exercise_name": string,"id": string,"item_id": string,"performed_on": string,"program_id": string,"result_text": string,"sets": NonNullable<Json>,"week": number,"workout_log_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "client_id": string,"created_at"?: string,"exercise_id"?: string | null,"exercise_name": string,"id"?: string,"item_id": string,"performed_on": string,"program_id": string,"result_text"?: string,"sets"?: NonNullable<Json>,"week": number,"workout_log_id": string
                  }
                  Update: {
                    "client_id"?: string,"created_at"?: string,"exercise_id"?: string | null,"exercise_name"?: string,"id"?: string,"item_id"?: string,"performed_on"?: string,"program_id"?: string,"result_text"?: string,"sets"?: NonNullable<Json>,"week"?: number,"workout_log_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "exercise_logs_client_id_fkey"
      columns: ["client_id"]
isOneToOne: false
      referencedRelation: "clients"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "exercise_logs_exercise_id_fkey"
      columns: ["exercise_id"]
isOneToOne: false
      referencedRelation: "exercises"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "exercise_logs_program_id_fkey"
      columns: ["program_id"]
isOneToOne: false
      referencedRelation: "programs"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "exercise_logs_workout_log_id_fkey"
      columns: ["workout_log_id"]
isOneToOne: false
      referencedRelation: "workout_logs"
      referencedColumns: ["id"]
    }
                  ]
                },"exercises": {
                  Row: {
                    "archived": boolean,"category": string,"created_at": string,"description": string,"id": string,"name": string,"updated_at": string,"video_url": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "archived"?: boolean,"category"?: string,"created_at"?: string,"description"?: string,"id"?: string,"name": string,"updated_at"?: string,"video_url"?: string | null
                  }
                  Update: {
                    "archived"?: boolean,"category"?: string,"created_at"?: string,"description"?: string,"id"?: string,"name"?: string,"updated_at"?: string,"video_url"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"messages": {
                  Row: {
                    "attachments": NonNullable<Json>,"body": string,"client_id": string,"created_at": string,"deleted_at": string | null,"id": string,"sender_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "attachments"?: NonNullable<Json>,"body"?: string,"client_id": string,"created_at"?: string,"deleted_at"?: string | null,"id"?: string,"sender_id"?: string | null
                  }
                  Update: {
                    "attachments"?: NonNullable<Json>,"body"?: string,"client_id"?: string,"created_at"?: string,"deleted_at"?: string | null,"id"?: string,"sender_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "messages_client_id_fkey"
      columns: ["client_id"]
isOneToOne: false
      referencedRelation: "clients"
      referencedColumns: ["id"]
    }
                  ]
                },"message_transcripts": {
                  Row: {
                    "client_id": string,"created_at": string,"message_id": string,"status": string,"text": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "client_id": string,"created_at"?: string,"message_id": string,"status"?: string,"text"?: string,"updated_at"?: string
                  }
                  Update: {
                    "client_id"?: string,"created_at"?: string,"message_id"?: string,"status"?: string,"text"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "message_transcripts_client_id_fkey"
      columns: ["client_id"]
isOneToOne: false
      referencedRelation: "clients"
      referencedColumns: ["id"]
    },
                    {
      foreignKeyName: "message_transcripts_message_id_fkey"
      columns: ["message_id"]
isOneToOne: true
      referencedRelation: "messages"
      referencedColumns: ["id"]
    }
                  ]
                },"notifications": {
                  Row: {
                    "body": string,"client_id": string | null,"created_at": string,"dedupe_key": string | null,"emailed_at": string | null,"id": string,"kind": string,"link": string | null,"read_at": string | null,"recipient_id": string,"title": string
                  }
                  ComputedFields: never
                  Insert: {
                    "body"?: string,"client_id"?: string | null,"created_at"?: string,"dedupe_key"?: string | null,"emailed_at"?: string | null,"id"?: string,"kind": string,"link"?: string | null,"read_at"?: string | null,"recipient_id": string,"title": string
                  }
                  Update: {
                    "body"?: string,"client_id"?: string | null,"created_at"?: string,"dedupe_key"?: string | null,"emailed_at"?: string | null,"id"?: string,"kind"?: string,"link"?: string | null,"read_at"?: string | null,"recipient_id"?: string,"title"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "notifications_client_id_fkey"
      columns: ["client_id"]
isOneToOne: false
      referencedRelation: "clients"
      referencedColumns: ["id"]
    }
                  ]
                },"payment_plans": {
                  Row: {
                    "active": boolean,"amount": number,"client_id": string,"created_at": string,"id": string,"kind": string,"method": string,"notes": string,"package_closed_on": string | null,"package_closed_sessions": number,"package_sessions": number | null,"sessions_written_off": number,"start_date": string
                  }
                  ComputedFields: never
                  Insert: {
                    "active"?: boolean,"amount"?: number,"client_id": string,"created_at"?: string,"id"?: string,"kind": string,"method"?: string,"notes"?: string,"package_closed_on"?: string | null,"package_closed_sessions"?: number,"package_sessions"?: number | null,"sessions_written_off"?: number,"start_date"?: string
                  }
                  Update: {
                    "active"?: boolean,"amount"?: number,"client_id"?: string,"created_at"?: string,"id"?: string,"kind"?: string,"method"?: string,"notes"?: string,"package_closed_on"?: string | null,"package_closed_sessions"?: number,"package_sessions"?: number | null,"sessions_written_off"?: number,"start_date"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "payment_plans_client_id_fkey"
      columns: ["client_id"]
isOneToOne: false
      referencedRelation: "clients"
      referencedColumns: ["id"]
    }
                  ]
                },"payments": {
                  Row: {
                    "amount": number,"client_id": string,"created_at": string,"created_by": string | null,"credit_change": number,"id": string,"method": string,"notes": string,"paid_on": string,"period_end": string | null,"period_start": string | null,"plan_id": string | null,"sessions": number | null,"unpaid": boolean
                  }
                  ComputedFields: never
                  Insert: {
                    "amount": number,"client_id": string,"created_at"?: string,"created_by"?: string | null,"credit_change"?: number,"id"?: string,"method"?: string,"notes"?: string,"paid_on"?: string,"period_end"?: string | null,"period_start"?: string | null,"plan_id"?: string | null,"sessions"?: number | null,"unpaid"?: boolean
                  }
                  Update: {
                    "amount"?: number,"client_id"?: string,"created_at"?: string,"created_by"?: string | null,"credit_change"?: number,"id"?: string,"method"?: string,"notes"?: string,"paid_on"?: string,"period_end"?: string | null,"period_start"?: string | null,"plan_id"?: string | null,"sessions"?: number | null,"unpaid"?: boolean
                  }
                  Relationships: [
                    {
      foreignKeyName: "payments_client_id_fkey"
      columns: ["client_id"]
isOneToOne: false
      referencedRelation: "clients"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "payments_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "payments_plan_id_fkey"
      columns: ["plan_id"]
isOneToOne: false
      referencedRelation: "payment_plans"
      referencedColumns: ["id"]
    }
                  ]
                },"posture_assessments": {
                  Row: {
                    "assessed_on": string,"client_id": string,"created_at": string,"created_by": string | null,"id": string,"notes": string,"posture_work": string,"tight_muscles": string,"visible_to_client": boolean,"what_works": string
                  }
                  ComputedFields: never
                  Insert: {
                    "assessed_on"?: string,"client_id": string,"created_at"?: string,"created_by"?: string | null,"id"?: string,"notes"?: string,"posture_work"?: string,"tight_muscles"?: string,"visible_to_client"?: boolean,"what_works"?: string
                  }
                  Update: {
                    "assessed_on"?: string,"client_id"?: string,"created_at"?: string,"created_by"?: string | null,"id"?: string,"notes"?: string,"posture_work"?: string,"tight_muscles"?: string,"visible_to_client"?: boolean,"what_works"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "posture_assessments_client_id_fkey"
      columns: ["client_id"]
isOneToOne: false
      referencedRelation: "clients"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "posture_assessments_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"profiles": {
                  Row: {
                    "created_at": string,"email": string,"full_name": string,"id": string,"last_email_at": string | null,"role": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"email": string,"full_name"?: string,"id": string,"role"?: string
                  }
                  Update: {
                    "created_at"?: string,"email"?: string,"full_name"?: string,"id"?: string,"last_email_at"?: string | null,"role"?: string
                  }
                  Relationships: [
                    
                  ]
                },"program_ai_drafts": {
                  Row: {
                    "client_id": string | null,"compared_at": string | null,"content": Json,"corrections": string,"created_at": string,"created_by": string | null,"id": string,"instruction": string,"learned_at": string | null,"program_id": string,"rows_changed": number | null,"rows_total": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "client_id"?: string | null,"compared_at"?: string | null,"content": Json,"corrections"?: string,"created_at"?: string,"created_by"?: string | null,"id"?: string,"instruction"?: string,"learned_at"?: string | null,"program_id": string,"rows_changed"?: number | null,"rows_total"?: number | null
                  }
                  Update: {
                    "client_id"?: string | null,"compared_at"?: string | null,"content"?: Json,"corrections"?: string,"created_at"?: string,"created_by"?: string | null,"id"?: string,"instruction"?: string,"learned_at"?: string | null,"program_id"?: string,"rows_changed"?: number | null,"rows_total"?: number | null
                  }
                  Relationships: []
                },"programs": {
                  Row: {
                    "ai_notes": Json | null,"client_id": string | null,"content": NonNullable<Json>,"created_at": string,"created_by": string | null,"description": string,"id": string,"is_ai_example": boolean,"is_template": boolean,"previous_program_id": string | null,"published_at": string | null,"session_minutes": number | null,"source": string,"start_date": string | null,"status": string,"title": string,"updated_at": string,"weeks": number
                  }
                  ComputedFields: never
                  Insert: {
                    "ai_notes"?: Json | null,"client_id"?: string | null,"content"?: NonNullable<Json>,"created_at"?: string,"created_by"?: string | null,"description"?: string,"id"?: string,"is_ai_example"?: boolean,"is_template"?: boolean,"previous_program_id"?: string | null,"published_at"?: string | null,"session_minutes"?: number | null,"source"?: string,"start_date"?: string | null,"status"?: string,"title": string,"updated_at"?: string,"weeks"?: number
                  }
                  Update: {
                    "ai_notes"?: Json | null,"client_id"?: string | null,"content"?: NonNullable<Json>,"created_at"?: string,"created_by"?: string | null,"description"?: string,"id"?: string,"is_ai_example"?: boolean,"is_template"?: boolean,"previous_program_id"?: string | null,"published_at"?: string | null,"session_minutes"?: number | null,"source"?: string,"start_date"?: string | null,"status"?: string,"title"?: string,"updated_at"?: string,"weeks"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "programs_client_id_fkey"
      columns: ["client_id"]
isOneToOne: false
      referencedRelation: "clients"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "programs_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "programs_previous_program_id_fkey"
      columns: ["previous_program_id"]
isOneToOne: false
      referencedRelation: "programs"
      referencedColumns: ["id"]
    }
                  ]
                },"push_subscriptions": {
                  Row: {
                    "auth": string,"created_at": string,"endpoint": string,"id": string,"last_used_at": string | null,"p256dh": string,"user_agent": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "auth": string,"created_at"?: string,"endpoint": string,"id"?: string,"last_used_at"?: string | null,"p256dh": string,"user_agent"?: string,"user_id": string
                  }
                  Update: {
                    "auth"?: string,"created_at"?: string,"endpoint"?: string,"id"?: string,"last_used_at"?: string | null,"p256dh"?: string,"user_agent"?: string,"user_id"?: string
                  }
                  Relationships: []
                },"pt_sessions": {
                  Row: {
                    "client_id": string,"counts_toward_package": boolean,"created_at": string,"created_by": string | null,"id": string,"notes": string,"session_date": string,"source": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "client_id": string,"counts_toward_package"?: boolean,"created_at"?: string,"created_by"?: string | null,"id"?: string,"notes"?: string,"session_date"?: string,"source"?: string | null
                  }
                  Update: {
                    "client_id"?: string,"counts_toward_package"?: boolean,"created_at"?: string,"created_by"?: string | null,"id"?: string,"notes"?: string,"session_date"?: string,"source"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "pt_sessions_client_id_fkey"
      columns: ["client_id"]
isOneToOne: false
      referencedRelation: "clients"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "pt_sessions_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"staff_invites": {
                  Row: {
                    "created_at": string,"email": string,"full_name": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"email": string,"full_name"?: string
                  }
                  Update: {
                    "created_at"?: string,"email"?: string,"full_name"?: string
                  }
                  Relationships: [
                    
                  ]
                },"workout_logs": {
                  Row: {
                    "client_id": string,"completed": boolean,"created_at": string,"day_id": string,"discomfort": string,"discomfort_seen_at": string | null,"note_flag": boolean | null,"note_reason": string,"note_seen_at": string | null,"id": string,"notes": string,"performed_on": string,"program_id": string,"updated_at": string,"week": number
                  }
                  ComputedFields: never
                  Insert: {
                    "client_id": string,"completed"?: boolean,"created_at"?: string,"day_id": string,"discomfort"?: string,"discomfort_seen_at"?: string | null,"note_flag"?: boolean | null,"note_reason"?: string,"note_seen_at"?: string | null,"id"?: string,"notes"?: string,"performed_on"?: string,"program_id": string,"updated_at"?: string,"week": number
                  }
                  Update: {
                    "client_id"?: string,"completed"?: boolean,"created_at"?: string,"day_id"?: string,"discomfort"?: string,"discomfort_seen_at"?: string | null,"note_flag"?: boolean | null,"note_reason"?: string,"note_seen_at"?: string | null,"id"?: string,"notes"?: string,"performed_on"?: string,"program_id"?: string,"updated_at"?: string,"week"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "workout_logs_client_id_fkey"
      columns: ["client_id"]
isOneToOne: false
      referencedRelation: "clients"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "workout_logs_program_id_fkey"
      columns: ["program_id"]
isOneToOne: false
      referencedRelation: "programs"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "accept_privacy":
{ Args: { "version": string; "instagram"?: boolean }; Returns: undefined
                           },
"billing_overview":
{ Args: Record<PropertyKey, never>; Returns: {
              "amount": number,"client_id": string,"kind": string,"paid_until": string,"plan_id": string,"sessions_bought": number,"sessions_used": number,"start_date": string
            }[]
                           },
"client_plan_kinds":
{ Args: Record<PropertyKey, never>; Returns: {
              "client_id": string,"kind": string
            }[]
                           },
"my_pt_balance":
{ Args: Record<PropertyKey, never>; Returns: {
              "bought": number,"used": number
            }[]
                           },
"pt_counters":
{ Args: Record<PropertyKey, never>; Returns: {
              "baseline_at": string | null,"bought": number,"client_id": string,"since": string,"used": number
            }[]
                           },
"business_name":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"can_log_program":
{ Args: { "cid": string,"pid": string }; Returns: boolean
                           },
"can_manage_client":
{ Args: { "cid": string }; Returns: boolean
                           },
"client_billing":
{ Args: { "cid": string }; Returns: {
              "amount": number,"kind": string,"paid_until": string,"plan_id": string,"sessions_bought": number,"sessions_used": number
            }[]
                           },
"client_staff_recipients":
{ Args: { "cid": string }; Returns: string[]
                           },
"is_client_self":
{ Args: { "cid": string }; Returns: boolean
                           },
"is_owner":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"is_staff":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"last_exercise_logs":
{ Args: { "before_date"?: string,"cid": string }; Returns: {
              "exercise_id": string,"exercise_name": string,"performed_on": string,"result_text": string,"sets": Json,"week": number
            }[]
                           },
"monday_of":
{ Args: { "d": string }; Returns: string
                           },
"my_checks":
{ Args: Record<PropertyKey, never>; Returns: {
              "body_fat_pct": number,"check_date": string,"circumferences": Json,"fat_mass_kg": number,"id": string,"lean_mass_kg": number,"strength_tests": Json,"tests_text": string,"weight_kg": number
            }[]
                           },
"my_check_photos":
{ Args: Record<PropertyKey, never>; Returns: {
              "check_date": string,"check_id": string,"created_at": string,"height": number,"id": string,"path": string,"sort_order": number,"thumb_path": string,"width": number
            }[]
                           },
"my_client_id":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"my_coach_name":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"my_pt_session_dates":
{ Args: Record<PropertyKey, never>; Returns: string[]
                           },
"my_role":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"my_unread_chats":
{ Args: Record<PropertyKey, never>; Returns: {
              "client_id": string,"last_at": string,"unread": number
            }[]
                           },
"withdraw_health_consent":
{ Args: Record<PropertyKey, never>; Returns: undefined
                           },
"set_instagram_consent":
{ Args: { "consent": boolean }; Returns: undefined
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
      Row: infer R
    }
    ? R
    : never
  : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Insert: infer I
    }
    ? I
    : never
  : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Update: infer U
    }
    ? U
    : never
  : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
  ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
  : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "public": {
          Enums: {
            
          }
        }
} as const
