import { ArrowRight, X, Zap } from "lucide-react";

/**
 * Modal qui propose des alternatives de course quand le mode demandé n'est pas disponible
 * Affiche les autres options VTC/TAXI avec des prix similaires
 */
export default function CourseAlternativesModal({
  course,
  onClose,
  onSelectAlternative
}) {
  if (!course) return null;

  const originalMode = course.courseMode || course.vehicle || "";
  const originalPrice = course.price || 0;

  // Générer des alternatives avec des prix similaires (+/- 20%)
  const generateAlternatives = () => {
    const alternatives = [];
    const type = (course.vehicleType || "").toLowerCase();

    // Si VTC demandé
    if (type === "vtc") {
      alternatives.push(
        {
          mode: "VtcConfort",
          label: "VTC CONFORT",
          description: "Climatisé, plus de confort",
          price: Math.round(originalPrice * 1.15),
          color: "indigo",
          icon: "🚗"
        },
        {
          mode: "VtcSuv",
          label: "VTC SUV",
          description: "Espace premium, 4 places",
          price: Math.round(originalPrice * 1.25),
          color: "slate",
          icon: "🚙"
        }
      );

      // Proposer aussi un Taxi si prix similaire
      alternatives.push({
        mode: "TaxiEco",
        label: "TAXI ÉCO",
        vehicleType: "taxi",
        description: "Compteur officiel",
        price: Math.round(originalPrice * 1.05),
        color: "amber",
        icon: "🚕"
      });
    }

    // Si TAXI demandé
    if (type === "taxi") {
      alternatives.push(
        {
          mode: "TaxiConfort",
          label: "TAXI CONFORT",
          description: "Plus d'espace et confort",
          price: Math.round(originalPrice * 1.15),
          color: "amber",
          icon: "🚕"
        },
        {
          mode: "TaxiSuv",
          label: "TAXI SUV",
          description: "Premium, 4 places",
          price: Math.round(originalPrice * 1.25),
          color: "orange",
          icon: "🚙"
        }
      );

      // Proposer aussi un VTC si prix similaire
      alternatives.push({
        mode: "VtcEco",
        label: "VTC ÉCO",
        vehicleType: "vtc",
        description: "Prix fixe économique",
        price: Math.round(originalPrice * 0.95),
        color: "emerald",
        icon: "🚗"
      });
    }

    return alternatives;
  };

  const alternatives = generateAlternatives();

  const getColorClasses = (color) => {
    const colors = {
      indigo: {
        bg: "bg-indigo-50",
        border: "border-indigo-200",
        text: "text-indigo-700",
        button: "bg-indigo-600 hover:bg-indigo-700"
      },
      slate: {
        bg: "bg-slate-50",
        border: "border-slate-200",
        text: "text-slate-700",
        button: "bg-slate-600 hover:bg-slate-700"
      },
      amber: {
        bg: "bg-amber-50",
        border: "border-amber-200",
        text: "text-amber-700",
        button: "bg-amber-600 hover:bg-amber-700"
      },
      orange: {
        bg: "bg-orange-50",
        border: "border-orange-200",
        text: "text-orange-700",
        button: "bg-orange-600 hover:bg-orange-700"
      },
      emerald: {
        bg: "bg-emerald-50",
        border: "border-emerald-200",
        text: "text-emerald-700",
        button: "bg-emerald-600 hover:bg-emerald-700"
      }
    };
    return colors[color] || colors.slate;
  };

  const handleSelect = (alternative) => {
    onSelectAlternative({
      ...course,
      courseMode: alternative.mode,
      vehicleType: alternative.vehicleType || course.vehicleType,
      price: alternative.price
    });
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-md bg-white shadow-2xl rounded-3xl animate-scale-in">
        {/* Header */}
        <div className="relative p-6 text-center bg-gradient-to-br from-red-500 to-orange-600 rounded-t-3xl">
          <button
            onClick={onClose}
            className="absolute p-2 transition-colors bg-white/20 rounded-xl top-4 right-4 hover:bg-white/30"
          >
            <X size={20} className="text-white" />
          </button>

          <div className="flex items-center justify-center w-16 h-16 mx-auto mb-3 bg-white rounded-full">
            <Zap size={32} className="text-orange-500 fill-orange-500" />
          </div>

          <h2 className="text-2xl italic font-black tracking-tight text-white uppercase">
            Mode indisponible
          </h2>
          <p className="mt-2 text-sm font-medium text-white/90">
            Aucun chauffeur <span className="font-black">{originalMode}</span> disponible
          </p>
        </div>

        {/* Body */}
        <div className="p-6">
          <p className="mb-4 text-xs font-bold tracking-widest text-center uppercase text-slate-400">
            Alternatives disponibles
          </p>

          <div className="space-y-3">
            {alternatives.map((alt, index) => {
              const colors = getColorClasses(alt.color);
              const priceDiff = alt.price - originalPrice;
              const priceDiffPercent = ((priceDiff / originalPrice) * 100).toFixed(0);

              return (
                <div
                  key={index}
                  className={`${colors.bg} ${colors.border} border-2 rounded-2xl p-4 transition-all hover:scale-[1.02] cursor-pointer`}
                  onClick={() => handleSelect(alt)}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xl">{alt.icon}</span>
                        <h3 className={`text-sm font-black uppercase ${colors.text}`}>
                          {alt.label}
                        </h3>
                      </div>
                      <p className="text-xs text-slate-600">
                        {alt.description}
                      </p>
                    </div>

                    <div className="text-right">
                      <p className="text-xl font-black text-slate-900">
                        {alt.price}F
                      </p>
                      {priceDiff !== 0 && (
                        <p className={`text-[10px] font-bold ${priceDiff > 0 ? 'text-orange-600' : 'text-green-600'}`}>
                          {priceDiff > 0 ? '+' : ''}{priceDiffPercent}%
                        </p>
                      )}
                    </div>
                  </div>

                  <button
                    className={`${colors.button} w-full mt-3 py-2 rounded-xl text-white font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-colors`}
                  >
                    Choisir cette option
                    <ArrowRight size={14} />
                  </button>
                </div>
              );
            })}
          </div>

          <button
            onClick={onClose}
            className="w-full py-3 mt-4 text-xs font-bold tracking-widest uppercase transition-colors rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-50"
          >
            Annuler la course
          </button>
        </div>
      </div>
    </div>
  );
}