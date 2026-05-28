export interface TargetProfile {
  name: string;
  father_name: string;
  mobile: string;
  address: string;
  circle: string;
  DocumentNumber: string;
  email: string;
  alt_mobile: string;
  alt_mobile2: string;
  alt_mobile3: string;
  alt_mobile4: string;
  linkedVia?: string;
  hopCount?: number;
  sherlockData?: SherlockProfile;
}

export interface SherlockSocial {
  whatsapp: boolean;
  telegram: boolean;
}

export interface SherlockProfile {
  name: string;
  location: string;
  carrier: string;
  social: SherlockSocial;
}

export interface PostalOffice {
  Name: string;
  BranchType: string;
  DeliveryStatus: string;
  Circle: string;
  District: string;
  Division: string;
  Region: string;
  State: string;
  Country: string;
  Pincode: string;
}

export interface VehicleRecord {
  taskId: string;
  status: string;
  gateway: string;
  message: string;
  accountId: string;
  timestamp: string;
  plateNumber?: string;
}

export interface UnifiedWorkspaceState {
  target: {
    searchType: "phone" | "doc" | "name";
    inputValue: string;
    nameValue: string;
    fatherValue: string;
    loading: boolean;
    error: string | null;
    profiles: TargetProfile[];
    sherlock: SherlockProfile | null;
    analyzerResult: string | null;
    analyzerLoading: boolean;
    timeDb1: string | null;
    timeDb2: string | null;
  };
  vehicle: {
    inputValue: string;
    loading: boolean;
    error: string | null;
    record: VehicleRecord | null;
  };
  pincode: {
    searchBy: "pin" | "place";
    inputValue: string;
    loading: boolean;
    error: string | null;
    offices: PostalOffice[];
  };
  imei: {
    inputValue: string;
    loading: boolean;
    error: string | null;
    metadata: {
      brand: string;
      model: string;
      manufacturer: string;
      deviceType: string;
      specifications: string;
    } | null;
  };
  history: {
    id: string;
    title: string;
    type: "target" | "vehicle" | "pincode" | "imei" | "iplookup";
    timestamp: string;
    query: string;
  }[];
}

export interface FindIpResponse {
  city?: {
    geoname_id?: number;
    names?: Record<string, string>;
  };
  continent?: {
    code?: string;
    geoname_id?: number;
    names?: Record<string, string>;
  };
  country?: {
    geoname_id?: number;
    is_in_european_union?: boolean;
    iso_code?: string;
    names?: Record<string, string>;
  };
  location?: {
    latitude?: number;
    longitude?: number;
    time_zone?: string;
    weather_code?: string;
  };
  postal?: {
    code?: string;
  };
  subdivisions?: Array<{
    geoname_id?: number;
    iso_code?: string;
    names?: Record<string, string>;
  }>;
  traits?: {
    autonomous_system_number?: number;
    autonomous_system_organization?: string;
    connection_type?: string;
    is_anycast?: boolean;
    isp?: string;
    organization?: string;
    user_type?: string;
  };
}
