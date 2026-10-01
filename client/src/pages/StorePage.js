/* eslint-disable no-unused-vars */
import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { doc, getDoc, collection, query, where, getDocs, deleteDoc } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { auth, db } from "../firebase";
import {
  MapPin, Search, Plus, ChevronLeft, Loader2, ShoppingBag, ArrowRight,
  Gauge, Zap, Calendar, Trash2,
  Thermometer, Scale, AlertTriangle, Box
} from "lucide-react";
import { toast, ToastContainer } from "react-toastify";
import { useCart } from "../Context/CartContext";
import "./StorePage.css";

export default function StorePage() {
  const { vendorId, productId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();

  const { cart, addToCart } = useCart();

  const [vendor, setVendor] = useState(null);
  const [products, setProducts] = useState([]);
  const [heroProduct, setHeroProduct] = useState(null);
  const [categories, setCategories] = useState(["Tous"]);
  const [activeCategory, setActiveCategory] = useState("Tous");
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(true);
  const [isScrolled, setIsScrolled] = useState(false);
  const [activeImgIndex, setActiveImgIndex] = useState(0);
  const [currentUser, setCurrentUser] = useState(null);

  // Options client (resto / fast-food) : niveau d'épices + allergènes
  const [clientEpices, setClientEpices] = useState("Moyen");
  const [clientAllergenes, setClientAllergenes] = useState([]);


  // Swipe hero
  const touchStartX = useRef(0);
  const touchDeltaX = useRef(0);
  const isDragging = useRef(false);

  const isOwner = !!(currentUser && vendorId && currentUser.uid === vendorId);

  const totalAmount = useMemo(() => {
    return cart.reduce((acc, item) => acc + Number(item.prix || 0) * (item.quantity || 1), 0);
  }, [cart]);

  const heroImages = useMemo(() => {
    if (!heroProduct) return [];
    if (Array.isArray(heroProduct.images) && heroProduct.images.length) return heroProduct.images;
    const one = heroProduct.image || heroProduct.imageUrl;
    return one ? [one] : [];
  }, [heroProduct]);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => setCurrentUser(u));
    return () => unsub();
  }, []);

  // Reset index image quand le hero change
  useEffect(() => {
    setActiveImgIndex(0);
    setClientEpices("Moyen");
    setClientAllergenes([]);
  }, [heroProduct?.id]);

  useEffect(() => {
    let isMounted = true;
    const fetchStoreData = async () => {
      try {
        setLoading(true);

        let vDoc = await getDoc(doc(db, "users", vendorId));
        let vendorData = null;

        if (vDoc.exists()) {
          vendorData = { id: vDoc.id, ...vDoc.data() };
        }

        if (!vendorData) {
          vendorData = {
            id: vendorId,
            nom: "Boutique Partenaire",
            statut: "Vendeur Vérifié",
            avatar: "https://placehold.co/100x100/7c3aed/ffffff/png?text=Boutique",
            isFallback: true,
          };
        }

        if (isMounted) setVendor(vendorData);

        const q = query(collection(db, "products"), where("vendorId", "==", vendorId));
        const snap = await getDocs(q);
        let prods = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

        if (prods.length === 0) {
          const qAlternate = query(collection(db, "products"), where("vendeurId", "==", vendorId));
          const snapAlternate = await getDocs(qAlternate);
          prods = snapAlternate.docs.map((d) => ({ id: d.id, ...d.data() }));
        }

        if (isMounted) {
          setProducts(prods);
          const uniqueCats = ["Tous", ...new Set(prods.map((p) => p.categorie).filter(Boolean))];
          setCategories(uniqueCats);
        }

        const hideHeroState = location.state?.hideHero;
        if (hideHeroState) {
          if (isMounted) setHeroProduct(null);
        } else if (productId) {
          const found = prods.find((p) => p.id === productId);
          if (found) {
            if (isMounted) setHeroProduct(found);
          } else {
            const pDoc = await getDoc(doc(db, "products", productId));
            if (pDoc.exists() && isMounted) setHeroProduct({ id: pDoc.id, ...pDoc.data() });
          }
        } else {
          if (isMounted) setHeroProduct(null);
        }
      } catch (e) {
        console.error("ERREUR STOREPAGE :", e);
        toast.error("Erreur de chargement de la vitrine.");
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    fetchStoreData();
    return () => {
      isMounted = false;
    };
  }, [vendorId, productId, location.state]);

  const handleDeleteProduct = async (e, pId, pName) => {
    e.stopPropagation();
    if (!isOwner) {
      toast.error("Action réservée au vendeur");
      return;
    }
    if (window.confirm(`Voulez-vous vraiment supprimer "${pName}" ?`)) {
      try {
        await deleteDoc(doc(db, "products", pId));
        const updatedProducts = products.filter((p) => p.id !== pId);
        setProducts(updatedProducts);
        if (heroProduct?.id === pId) setHeroProduct(null);
        toast.success("Produit supprimé");
      } catch (error) {
        toast.error("Erreur lors de la suppression");
      }
    }
  };

  const handleScroll = (e) => {
    setIsScrolled(e.target.scrollTop > 106);
  };

  const handleAddToCart = (p, extras = {}) => {
    const t = (p.type || "").toLowerCase();
    const isFood =
      t === "resto" ||
      t === "fastfood" ||
      t === "resto_fastfood" ||
      t.includes("resto");

    const productToCart = {
      ...p,
      id: p.id,
      vendorId,
      vendeurId: vendorId,
      quantity: 1,
      prix: Number(p.prix || 0),
      image:
        (p.images && p.images[0]) ||
        p.image ||
        p.imageUrl ||
        "https://placehold.co/150x150/7c3aed/ffffff/png?text=Produit",
      // Préférences client (plats)
      ...(isFood
        ? {
            clientEpices: extras.epices ?? clientEpices,
            clientAllergenes: extras.allergenes ?? clientAllergenes,
            noteCuisine:
              (extras.epices ?? clientEpices)
                ? `Épices: ${extras.epices ?? clientEpices}` +
                  ((extras.allergenes ?? clientAllergenes)?.length
                    ? ` | Éviter: ${(extras.allergenes ?? clientAllergenes).join(", ")}`
                    : "")
                : undefined,
          }
        : {}),
    };
    addToCart(productToCart);
    toast.success(
      isFood && (extras.epices || clientEpices)
        ? `${p.nom} ajouté (${extras.epices ?? clientEpices})`
        : `${p.nom} ajouté !`
    );
  };

  const handleLogoClick = () => {
    setHeroProduct(null);
    navigate(`/store/${vendorId}`, { state: { hideHero: true } });
  };

  // ── Swipe hero images ────────────────────────────────────────────────────
  const goToSlide = useCallback(
    (dir) => {
      if (heroImages.length <= 1) return;
      setActiveImgIndex((prev) => {
        if (dir === "next") return (prev + 1) % heroImages.length;
        return (prev - 1 + heroImages.length) % heroImages.length;
      });
    },
    [heroImages.length]
  );

  const onTouchStart = (e) => {
    if (heroImages.length <= 1) return;
    isDragging.current = true;
    touchStartX.current = e.touches[0].clientX;
    touchDeltaX.current = 0;
  };

  const onTouchMove = (e) => {
    if (!isDragging.current) return;
    touchDeltaX.current = e.touches[0].clientX - touchStartX.current;
  };

  const onTouchEnd = () => {
    if (!isDragging.current) return;
    isDragging.current = false;
    const threshold = 50;
    if (touchDeltaX.current < -threshold) goToSlide("next");
    else if (touchDeltaX.current > threshold) goToSlide("prev");
    touchDeltaX.current = 0;
  };

  // Header background = logo vendeur
  const headerBg =
    vendor?.logo && !String(vendor.logo).includes("via.placeholder.com")
      ? vendor.logo
      : vendor?.photoURL && !String(vendor.photoURL).includes("via.placeholder.com")
        ? vendor.photoURL
        : null;

  if (loading) {
    return (
      <div className="s-loader-full">
        <Loader2 className="spinner-large animate-spin" color="#7c3aed" size={30} />
        <p>Mambo prépare la vitrine...</p>
      </div>
    );
  }

  const filteredProducts = products
    .filter((p) => p.id !== heroProduct?.id)
    .filter(
      (p) =>
        (activeCategory === "Tous" || p.categorie === activeCategory) &&
        (p.nom || "").toLowerCase().includes(searchTerm.toLowerCase())
    );

  const storeName =
    vendor?.nomBoutique || vendor?.enseigne || vendor?.displayName || vendor?.nomComplet || "Boutique";

  return (
    <div className="s-page-wrapper">
      <ToastContainer theme="dark" position="top-center" autoClose={1500} hideProgressBar />

      {/* ── HEADER : logo en plein fond ── */}
      <header
        className={`s-dynamic-header ${isScrolled ? "shrunk" : "large"} ${headerBg ? "has-bg" : ""}`}
        style={
          headerBg
            ? {
                backgroundImage: `linear-gradient(180deg, rgba(15,23,42,0.35) 0%, rgba(15,23,42,0.75) 100%), url(${headerBg})`,
              }
            : undefined
        }
      >
        <div className="s-header-content">
          <button type="button" className="s-icon-btn s-icon-btn--glass" onClick={() => navigate(-1)}>
            <ChevronLeft size={24} />
          </button>

          {/* Extrait de StorePage.js - Affichage dynamique de la zone */}
<div className="s-brand-overlay-title">
  <h1>{storeName}</h1>
  <span>
    <MapPin size={10} /> {vendor?.adresse || "Côte d'Ivoire"}
  </span>
</div>

          <div className="s-vendor-brand" onClick={handleLogoClick} role="button" tabIndex={0}>
            {!isScrolled && headerBg && (
              <div className="s-brand-overlay-title">
                <h1>{storeName}</h1>
                <span>
                  <MapPin size={10} /> {vendor?.adresse || "Côte d'Ivoire"}
                </span>
              </div>
            )}
            {(isScrolled || !headerBg) && (
              <>
                <img
                  src={
                    headerBg ||
                    "https://placehold.co/80x80/7c3aed/ffffff/png?text=Store"
                  }
                  alt="Logo"
                  className="s-brand-logo"
                  onError={(e) => {
                    e.target.onerror = null;
                    e.target.src = "https://placehold.co/80x80/7c3aed/ffffff/png?text=Store";
                  }}
                />
                <div className="s-brand-info">
                  <h1>{storeName}</h1>
                  {!isScrolled && (
                    <span>
                      <MapPin size={10} /> {vendor?.adresse || "Côte d'Ivoire"}
                    </span>
                  )}
                </div>
              </>
            )}
          </div>

          <button
            type="button"
            className="s-icon-btn s-icon-btn--glass cart-anchor"
            onClick={() => navigate("/cart")}
          >
            <ShoppingBag size={22} />
            {cart && cart.length > 0 && <span className="s-badge-dot">{cart.length}</span>}
          </button>
        </div>
      </header>

      <main className="s-main-scroll" onScroll={handleScroll}>
        <div className="s-content-buffer" />

        {/* ── HERO avec swipe ── */}
        {heroProduct && (
          <section className={`s-hero-card ${isScrolled ? "hero-compact" : "hero-full"}`}>
            <div className="s-hero-inner">
              <div
                className="s-hero-visual"
                onTouchStart={onTouchStart}
                onTouchMove={onTouchMove}
                onTouchEnd={onTouchEnd}
              >
                {heroImages.length > 0 ? (
                  <div className="s-slider-container">
                    <div
                      className="s-slider-track"
                      style={{
                        transform: `translateX(-${activeImgIndex * 100}%)`,
                      }}
                    >
                      {heroImages.map((img, idx) => (
                        <div key={idx} className="s-slider-slide">
                          <img src={img} alt={`${heroProduct.nom} ${idx + 1}`} />
                        </div>
                      ))}
                    </div>

                    {heroImages.length > 1 && (
                      <>
                        <button
                          type="button"
                          className="s-slider-nav s-slider-nav--prev"
                          onClick={() => goToSlide("prev")}
                          aria-label="Image précédente"
                        >
                          ‹
                        </button>
                        <button
                          type="button"
                          className="s-slider-nav s-slider-nav--next"
                          onClick={() => goToSlide("next")}
                          aria-label="Image suivante"
                        >
                          ›
                        </button>
                        <div className="s-slider-dots">
                          {heroImages.map((_, i) => (
                            <button
                              key={i}
                              type="button"
                              className={`s-dot ${i === activeImgIndex ? "active" : ""}`}
                              onClick={() => setActiveImgIndex(i)}
                              aria-label={`Image ${i + 1}`}
                            />
                          ))}
                        </div>
                        <span className="s-slider-counter">
                          {activeImgIndex + 1}/{heroImages.length}
                        </span>
                      </>
                    )}
                  </div>
                ) : (
                  <img
                    src="https://placehold.co/400x400/7c3aed/ffffff/png?text=Produit"
                    alt={heroProduct.nom}
                  />
                )}
              </div>

              <div className="s-hero-meta">
                <div className="s-hero-text">
                  <div className="s-hero-top-row">
                    {heroProduct.categorie && (
                      <span className="s-category-tag">{heroProduct.categorie}</span>
                    )}
                    {heroProduct.marque && (
                      <span className="s-brand-tag">
                        <Box size={10} /> {heroProduct.marque}
                      </span>
                    )}
                  </div>
                  <h2>{heroProduct.nom}</h2>

                  {(() => {
                    const t = (heroProduct.type || "").toLowerCase().trim();
                    const isSuper =
                      t === "supermarche" ||
                      t === "supermarket" ||
                      t.includes("super");
                    const isVeh = t === "vehicule" || t.includes("vehic");
                    const isResto =
                      t === "resto" ||
                      t === "resto_fastfood" ||
                      t === "fastfood" ||
                      t.includes("resto");
                    const isImmo = t === "immobilier" || t.includes("immo");
                    const isSante =
                      t === "sante" ||
                      t === "autre" ||
                      t.includes("pharma") ||
                      t.includes("sante");
                    const isBoutique =
                      t === "boutique" ||
                      t === "deal_particulier" ||
                      t === "en_ligne";
                    const specs = heroProduct.detailsSpecifiques || {};
                    const pick = (...keys) => {
                      for (const k of keys) {
                        const v =
                          heroProduct[k] ??
                          specs[k] ??
                          specs[k?.replace?.(/_/g, " ")];
                        if (v !== undefined && v !== null && String(v).trim() !== "")
                          return v;
                      }
                      return null;
                    };
                    const items = [];

                    if (isSuper) {
                      const v1 = pick("poidsVolume", "Poids / Volume", "Contenance");
                      const v2 = pick("conservation", "temperature", "Cons.");
                      const v3 = pick("datelimit", "Date limite", "DLC");
                      const v4 = pick("marque", "Marque");
                      const v5 = pick("origine", "Origine / Provenance");
                      if (v1) items.push(["Contenance", v1, "scale"]);
                      if (v2) items.push(["Cons.", v2, "thermo"]);
                      if (v3) items.push(["DLC", v3, "cal"]);
                      if (v4) items.push(["Marque", v4, "box"]);
                      if (v5) items.push(["Origine", v5, "box"]);
                    } else if (isVeh) {
                      const marque = pick("marque", "Marque");
                      const modele = pick("modele", "modele_annee", "Modèle");
                      const annee = pick("annee", "Année");
                      const km = pick("km", "kilometrage", "Kilométrage");
                      const boite = pick("boite", "Boîte de vitesses", "Boîte");
                      const carburant = pick("carburant", "energie", "Carburant", "Energie");
                      const etat = pick("etat", "État");
                      if (marque) items.push(["Marque", marque, "box"]);
                      if (modele) items.push(["Modèle", modele, "box"]);
                      if (annee) items.push(["Année", annee, "cal"]);
                      if (km) items.push(["Km", `${km} km`, "gauge"]);
                      if (boite) items.push(["Boîte", boite, "zap"]);
                      if (carburant) items.push(["Carburant", carburant, "zap"]);
                      if (etat) items.push(["État", etat, "box"]);
                    } else if (isResto) {
                      const prep = pick("tempsPrep", "Temps de préparation", "Prépa");
                      const portion = pick("portion", "Portion");
                      const epices = pick("epices", "epice", "Niveau d'épices", "Épices");
                      const allergenes = pick("allergenes", "Allergènes");
                      const acc = pick("accompagnements", "Accompagnements");
                      if (prep) items.push(["Prépa", prep, "cal"]);
                      if (portion) items.push(["Portion", portion, "box"]);
                      if (epices) items.push(["Épices", epices, "thermo"]);
                      if (acc) items.push(["Avec", acc, "box"]);
                      if (allergenes) items.push(["Allergènes", allergenes, "thermo"]);
                    } else if (isImmo) {
                      const surface = pick("surface", "Surface (m²)", "Surface");
                      const pieces = pick("pieces", "Nombre de pièces", "Pièces");
                      const quartier = pick("quartier", "localisation", "Quartier / Zone", "Zone");
                      const meublement = pick("meublement", "Meublé");
                      const bail = pick("bail", "Type de bail");
                      if (surface) items.push(["Surface", `${surface} m²`, "scale"]);
                      if (pieces) items.push(["Pièces", pieces, "box"]);
                      if (quartier) items.push(["Zone", quartier, "map"]);
                      if (meublement) items.push(["Meublé", meublement, "box"]);
                      if (bail) items.push(["Bail", bail, "box"]);
                    } else if (isSante) {
                      const marque = pick("marque", "Marque / Laboratoire", "Marque");
                      const forme = pick("forme", "Forme");
                      const posologie = pick("posologie", "Posologie indicative");
                      const ordonnance = pick("ordonnance", "Ordonnance requise");
                      const dlc = pick("datelimit", "Date de péremption", "DLC");
                      if (marque) items.push(["Marque", marque, "box"]);
                      if (forme) items.push(["Forme", forme, "box"]);
                      if (posologie) items.push(["Posologie", posologie, "cal"]);
                      if (ordonnance) items.push(["Ordonnance", ordonnance, "thermo"]);
                      if (dlc) items.push(["Péremption", dlc, "cal"]);
                    } else if (isBoutique) {
                      const marque = pick("marque", "Marque");
                      const taille = pick("taille", "Taille / Pointure");
                      const couleur = pick("couleur", "Couleur");
                      const etat = pick("etat", "État");
                      const negociable = pick("negociable", "Négociable");
                      if (marque) items.push(["Marque", marque, "box"]);
                      if (taille) items.push(["Taille", taille, "box"]);
                      if (couleur) items.push(["Couleur", couleur, "box"]);
                      if (etat) items.push(["État", etat, "box"]);
                      if (negociable) items.push(["Négociable", negociable, "zap"]);
                    } else {
                      Object.entries(specs)
                        .slice(0, 4)
                        .forEach(([k, v]) => {
                          if (v) items.push([String(k).replace(/_/g, " "), String(v), "box"]);
                        });
                    }

                    if (!items.length) return null;
                    const icon = (kind) => {
                      if (kind === "scale") return <Scale size={14} />;
                      if (kind === "thermo") return <Thermometer size={14} />;
                      if (kind === "cal") return <Calendar size={14} />;
                      if (kind === "gauge") return <Gauge size={14} />;
                      if (kind === "zap") return <Zap size={14} />;
                      if (kind === "map") return <MapPin size={14} />;
                      return <Box size={13} />;
                    };
                    return (
                      <div className="s-product-specs-grid">
                        {items.map(([label, value, kind], idx) => (
                          <div key={idx} className="s-spec-item">
                            <div className="s-spec-icon-box">
                              {icon(kind)} <span className="s-spec-label">{label}</span>
                            </div>
                            <div className="s-spec-value">{value}</div>
                          </div>
                        ))}
                      </div>
                    );
                  })()}

                  {(() => {
                    const t = (heroProduct.type || "").toLowerCase();
                    const isFood =
                      t === "resto" ||
                      t === "fastfood" ||
                      t === "resto_fastfood" ||
                      t.includes("resto");
                    if (!isFood) return null;
                    const ALLERGENE_OPTS = [
                      "Gluten",
                      "Arachides",
                      "Lait / Lactose",
                      "Œufs",
                      "Poisson",
                      "Crustacés",
                      "Soja",
                      "Fruits à coque",
                    ];
                    const toggleAllergene = (a) => {
                      setClientAllergenes((prev) =>
                        prev.includes(a) ? prev.filter((x) => x !== a) : [...prev, a]
                      );
                    };
                    return (
                      <div className="s-client-food-prefs">
                        <p className="s-client-food-prefs__title">Vos préférences</p>
                        <span className="s-client-food-prefs__label">Niveau d&apos;épices</span>
                        <div className="s-client-food-prefs__row">
                          {["Doux", "Moyen", "Fort"].map((lvl) => (
                            <button
                              key={lvl}
                              type="button"
                              className={`s-pref-chip s-pref-chip--epice${clientEpices === lvl ? " active" : ""}`}
                              onClick={() => setClientEpices(lvl)}
                            >
                              {lvl === "Doux" ? "🌶️ Doux" : lvl === "Moyen" ? "🌶️🌶️ Moyen" : "🌶️🌶️🌶️ Fort"}
                            </button>
                          ))}
                        </div>
                        <span className="s-client-food-prefs__label">Allergènes à éviter</span>
                        <div className="s-client-food-prefs__row">
                          {ALLERGENE_OPTS.map((a) => {
                            const on = clientAllergenes.includes(a);
                            return (
                              <button
                                key={a}
                                type="button"
                                className={`s-pref-chip s-pref-chip--allergene${on ? " active" : ""}`}
                                onClick={() => toggleAllergene(a)}
                              >
                                {on ? "✓ " : ""}{a}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })()}

                  {heroProduct.allergenes && (
                    <div className="s-hero-warning">
                      <AlertTriangle size={14} />{" "}
                      <span>Allergènes signalés par le resto : {heroProduct.allergenes}</span>
                    </div>
                  )}

                  {heroProduct.description && (
                    <div
                      className="s-hero-description"
                      onWheel={(e) => e.stopPropagation()}
                      onTouchStart={(e) => e.stopPropagation()}
                    >
                      {heroProduct.description}
                    </div>
                  )}

                  <div className="s-hero-price-group">
                    <span className="s-hero-price">
                      {Number(heroProduct.prix || 0).toLocaleString()} F
                    </span>
                    {heroProduct.unite &&
                      String(heroProduct.unite).trim() &&
                      String(heroProduct.unite).toLowerCase() !== "n/a" && (
                        <span className="s-hero-unit">/ {heroProduct.unite}</span>
                      )}
                  </div>
                </div>
                <button
                  type="button"
                  className="s-hero-btn"
                  onClick={() => handleAddToCart(heroProduct)}
                >
                  AJOUTER <Plus size={15} />
                </button>
              </div>
            </div>
          </section>
        )}

        <div className="s-explore-zone">
          <div className={`s-sticky-bar ${heroProduct ? "with-hero" : "no-hero"}`}>
            <div className="s-search-input">
              <Search size={18} />
              <input
                type="text"
                placeholder="Rechercher dans la boutique…"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <div className="s-chips-row">
              {categories.map((c) => (
                <button
                  key={c}
                  type="button"
                  className={`s-chip ${activeCategory === c ? "active" : ""}`}
                  onClick={() => setActiveCategory(c)}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>

          {filteredProducts.length === 0 ? (
            <div className="s-empty-products">
              <p>Aucun produit dans cette catégorie.</p>
            </div>
          ) : (
            <div className={`s-products-grid ${heroProduct ? "" : "s-products-grid--flush"}`}>
              {filteredProducts.map((p) => (
                <div
                  key={p.id}
                  className="s-item-card"
                  onClick={() => navigate(`/store/${vendorId}/${p.id}`)}
                >
                  <div className="s-item-img">
                    <img
                      src={
                        p.images?.[0] ||
                        p.image ||
                        "https://placehold.co/200x200/7c3aed/ffffff/png?text=Produit"
                      }
                      alt={p.nom}
                      onError={(e) => {
                        e.target.onerror = null;
                        e.target.src =
                          "https://placehold.co/200x200/7c3aed/ffffff/png?text=Produit";
                      }}
                    />
                    {isOwner && (
                      <button
                        type="button"
                        className="s-item-delete-btn"
                        onClick={(e) => handleDeleteProduct(e, p.id, p.nom)}
                        aria-label="Supprimer"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                    {(() => {
                      const pt = (p.type || "").toLowerCase();
                      if ((pt === "supermarche" || pt === "supermarket") && p.poidsVolume)
                        return <span className="s-card-weight-tag">{p.poidsVolume}</span>;
                      if (pt === "vehicule" && (p.km || p.kilometrage))
                        return <span className="s-card-weight-tag">{p.km || p.kilometrage} km</span>;
                      if ((pt === "sante" || pt === "autre") && p.forme)
                        return <span className="s-card-weight-tag">{p.forme}</span>;
                      if ((pt === "resto" || pt === "fastfood") && p.tempsPrep)
                        return <span className="s-card-weight-tag">{p.tempsPrep}</span>;
                      return null;
                    })()}
                  </div>
                  <div className="s-item-info">
                    <div className="s-item-header">
                      <span className="s-item-cat">{p.categorie}</span>
                      {p.marque && <span className="s-item-brand">{p.marque}</span>}
                    </div>
                    <h3>{p.nom}</h3>
                    <div className="s-item-price-row">
                      <span className="s-price-current">
                        {Number(p.prix || 0).toLocaleString()} F
                      </span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleAddToCart(p);
                        }}
                        className="s-add-small"
                      >
                        <Plus size={16} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      {cart && cart.length > 0 && (
        <div className="s-cart-floating-card" onClick={() => navigate("/cart")}>
          <div className="s-cart-preview">
            <div className="s-cart-icon-wrapper">
              <ShoppingBag size={22} strokeWidth={2.5} />
              <span className="s-cart-badge-count">{cart.length}</span>
            </div>
            <div className="s-cart-info-text">
              <span className="s-cart-label">Votre Panier</span>
              <span className="s-cart-total">{totalAmount.toLocaleString()} F</span>
            </div>
          </div>
          <button type="button" className="s-cart-cta">
            <span>Finaliser</span>
            <ArrowRight size={18} />
          </button>
        </div>
      )}
    </div>
  );
}