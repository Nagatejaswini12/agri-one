import type { CropDiagnosisResult, Farm, FarmCrop, Farmer, Scan, SoilRecord, SupportedLanguage } from "@agri-one/shared-types";

// Supabase rows are snake_case; shared-types are camelCase. Small, boring
// mappers here beat scattering ad-hoc field renames across every hook.

export interface FarmerRow {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  preferred_language: string;
  created_at: string;
  updated_at: string;
}

export function mapFarmerRow(row: FarmerRow): Farmer {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    preferredLanguage: row.preferred_language as SupportedLanguage,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export interface FarmRow {
  id: string;
  farmer_id: string;
  name: string;
  latitude: number | null;
  longitude: number | null;
  state: string | null;
  district: string | null;
  area_acres: number | null;
  created_at: string;
  updated_at: string;
}

export function mapFarmRow(row: FarmRow): Farm {
  return {
    id: row.id,
    farmerId: row.farmer_id,
    name: row.name,
    latitude: row.latitude,
    longitude: row.longitude,
    state: row.state,
    district: row.district,
    areaAcres: row.area_acres,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export interface FarmCropRow {
  id: string;
  farm_id: string;
  crop_name: string;
  variety: string | null;
  sowing_date: string | null;
  current_stage: string | null;
  status: FarmCrop["status"];
}

export function mapFarmCropRow(row: FarmCropRow): FarmCrop {
  return {
    id: row.id,
    farmId: row.farm_id,
    cropName: row.crop_name,
    variety: row.variety,
    sowingDate: row.sowing_date,
    currentStage: row.current_stage,
    status: row.status
  };
}

export interface SoilRecordRow {
  id: string;
  farm_id: string;
  source: SoilRecord["source"];
  soil_type: string | null;
  nitrogen: number | null;
  phosphorus: number | null;
  potassium: number | null;
  ph: number | null;
  organic_carbon: number | null;
  tested_on: string | null;
  document_url: string | null;
  created_at: string;
}

export function mapSoilRecordRow(row: SoilRecordRow): SoilRecord {
  return {
    id: row.id,
    farmId: row.farm_id,
    source: row.source,
    soilType: row.soil_type,
    nitrogen: row.nitrogen,
    phosphorus: row.phosphorus,
    potassium: row.potassium,
    ph: row.ph,
    organicCarbon: row.organic_carbon,
    testedOn: row.tested_on,
    documentUrl: row.document_url,
    createdAt: row.created_at
  };
}

export interface ScanRow {
  id: string;
  farm_id: string;
  crop_id: string;
  image_url: string;
  diagnosis_result: CropDiagnosisResult | null;
  confidence: number | null;
  created_at: string;
}

export function mapScanRow(row: ScanRow): Scan {
  return {
    id: row.id,
    farmId: row.farm_id,
    cropId: row.crop_id,
    imageUrl: row.image_url,
    diagnosisResult: row.diagnosis_result,
    confidence: row.confidence,
    createdAt: row.created_at
  };
}
