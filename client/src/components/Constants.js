/**
 * ✅ CONSTANTES GLOBALES DE L'APPLICATION
 * Centralise la logique métier pour le Client, le Chauffeur et l'Admin.
 */

// --- COMMISSIONS ---
// Commission standard (Moto, VTC Eco/Confort, Taxi)
export const COMMISSION_RATE_STANDARD = 0.13; // 13%

// Commission Premium (VTC SUV, Services Spécifiques si besoin)
export const COMMISSION_RATE_PREMIUM = 0.17; // 17%

// --- TYPES DE VÉHICULES ---
// Correspond exactement aux filtres de ton interface
export const VEHICLE_TYPES = {
    MOTO: 'moto',
    VTC: 'vtc',
    TAXI: 'taxi'
};

// --- MODES DE SERVICE ---
// Utile pour différencier les tarifs et commissions
export const SERVICE_MODES = {
    MOTO_ECONO: 'MON ÉCO',
    MOTO_CHAP: 'CHAP CHAP',
    MOTO_NOSTRESS: 'NO STRESS',
    VTC_ECO: 'ÉCO',
    VTC_CONFORT: 'CONFORT',
    VTC_SUV: 'SUV',
    TAXI_ECO: 'ÉCO',
    TAXI_CONFORT: 'CONFORT',
    TAXI_NEGOS: 'negos'
};

// --- STATUTS DE COURSE ---
export const COURSE_STATUS = {
    PENDING: 'pending',             // En attente d'un chauffeur
    ASSIGNED: 'assigned',           // Chauffeur trouvé (sonnerie chez lui)
    ACCEPTED: 'accepted',           // Le chauffeur a accepté
    ARRIVED: 'arrived_at_pickup',   // Chauffeur sur place
    IN_TRANSIT: 'in_transit',       // Course en cours
    COMPLETED: 'completed',         // Arrivé à destination
    CANCELLED: 'cancelled'          // Annulée par client ou chauffeur
};

// --- STATUTS DE PAIEMENT ---
export const PAYMENT_STATUS = {
    UNPAID: 'unpaid',
    PAID: 'paid',
    PENDING: 'pending'
};

// --- HELPERS (LOGIQUE MÉTIER) ---

/**
 * Normalise le type de véhicule pour éviter les erreurs de casse
 */
export const normalizeVehicleType = (type) => {
    if (!type) return VEHICLE_TYPES.MOTO;
    return type.toLowerCase().trim();
};

/**
 * Calcule la commission selon le mode de service
 * @param {number} price - Prix total de la course
 * @param {string} mode - Mode de service (SUV, etc.)
 */
export const calculateCommission = (price, mode = "") => {
    const isPremium = mode.toUpperCase().includes("SUV");
    const rate = isPremium ? COMMISSION_RATE_PREMIUM : COMMISSION_RATE_STANDARD;
    return Math.round(price * rate);
};

/**
 * Détermine si le mode est une négociation (Taxi Arrangement)
 */
export const isNegotiationMode = (mode) => {
    return mode === SERVICE_MODES.TAXI_NEGOS;
};