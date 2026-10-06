import React from 'react';
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Image,
  pdf,
} from '@react-pdf/renderer';
import type { TenantInfo } from '../types';

export interface ReciboPDFItem {
  codigo?: string;
  descripcion: string;
  cantidad: number;
  unidadMedida?: string;
  precioUnitario: number;
  descuento?: number;
  subtotal: number;
  isv?: number;
  totalLinea: number;
}

export interface ReciboPDFProps {
  tipo: 'VENTA' | 'COTIZACION';
  numeroDocumento: string | number;
  fechaEmision?: string;
  fechaValidez?: string;
  diasValidez?: number;
  clienteNombre: string;
  clienteRtn?: string;
  vendedorNombre?: string;
  metodoPago?: string;
  condicionesPago?: string;
  notas?: string;
  items: ReciboPDFItem[];
  subtotal: number;
  descuento?: number;
  isv: number;
  /** Historical general rate supplied by the quotation contract, never tenant branding. */
  porcentajeIsv?: number;
  total: number;
  tenant: TenantInfo;
}

const formatMoney = (amount: number, simbolo = 'L.'): string => {
  const num = isNaN(amount) ? 0 : amount;
  return `${simbolo} ${num.toLocaleString('es-HN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
};

export const ReciboPDF: React.FC<ReciboPDFProps> = ({
  tipo,
  numeroDocumento,
  fechaEmision,
  fechaValidez,
  diasValidez = 15,
  clienteNombre,
  clienteRtn,
  vendedorNombre,
  metodoPago,
  condicionesPago,
  notas,
  items,
  subtotal,
  descuento = 0,
  isv,
  porcentajeIsv,
  total,
  tenant,
}) => {
  const primaryColor = tenant.colorPrimario || '#1E3A8A';
  // Ventas guardan importes e ISV, sin moneda ni tasa global histórica.
  // Cotizaciones proporcionan una tasa general transaccional y líneas exentas.
  const currencySymbol = 'L.';
  const taxName = 'ISV';

  const styles = StyleSheet.create({
    page: {
      padding: 30,
      fontSize: 10,
      fontFamily: 'Helvetica',
      color: '#1C1917',
    },
    headerRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      marginBottom: 15,
      borderBottomWidth: 2,
      borderBottomColor: primaryColor,
      paddingBottom: 10,
    },
    companyBox: {
      flexDirection: 'column',
      maxWidth: '60%',
    },
    logo: {
      width: 120,
      height: 40,
      objectFit: 'contain',
      marginBottom: 6,
    },
    companyName: {
      fontSize: 16,
      fontFamily: 'Helvetica-Bold',
      color: primaryColor,
      textTransform: 'uppercase',
      marginBottom: 3,
    },
    companyMeta: {
      fontSize: 8,
      color: '#57534E',
      marginBottom: 2,
    },
    docBox: {
      flexDirection: 'column',
      alignItems: 'flex-end',
    },
    docTitle: {
      fontSize: 13,
      fontFamily: 'Helvetica-Bold',
      color: primaryColor,
      textTransform: 'uppercase',
      marginBottom: 4,
    },
    docNumber: {
      fontSize: 11,
      fontFamily: 'Helvetica-Bold',
      color: '#1C1917',
      marginBottom: 4,
    },
    docMeta: {
      fontSize: 8,
      color: '#57534E',
      marginBottom: 2,
    },
    infoGrid: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      backgroundColor: '#F5F5F4',
      borderRadius: 4,
      padding: 8,
      marginBottom: 15,
    },
    infoCol: {
      flexDirection: 'column',
      maxWidth: '48%',
    },
    infoLabel: {
      fontSize: 8,
      fontFamily: 'Helvetica-Bold',
      color: '#78716C',
      marginBottom: 2,
    },
    infoValue: {
      fontSize: 9,
      color: '#1C1917',
      marginBottom: 3,
    },
    table: {
      width: '100%',
      marginBottom: 15,
    },
    tableHeader: {
      flexDirection: 'row',
      backgroundColor: primaryColor,
      borderRadius: 2,
      paddingVertical: 5,
      paddingHorizontal: 6,
    },
    tableHeaderCell: {
      color: '#FFFFFF',
      fontFamily: 'Helvetica-Bold',
      fontSize: 8,
      textTransform: 'uppercase',
    },
    tableRow: {
      flexDirection: 'row',
      borderBottomWidth: 1,
      borderBottomColor: '#E7E5E4',
      paddingVertical: 5,
      paddingHorizontal: 6,
      alignItems: 'center',
    },
    tableCell: {
      fontSize: 8,
      color: '#292524',
    },
    colCode: { width: '15%' },
    colDesc: { width: '40%' },
    colQty: { width: '10%', textAlign: 'center' },
    colPrice: { width: '15%', textAlign: 'right' },
    colTotal: { width: '20%', textAlign: 'right' },

    summaryRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginTop: 10,
    },
    notesBox: {
      width: '55%',
      backgroundColor: '#FAFAF9',
      borderWidth: 1,
      borderColor: '#E7E5E4',
      borderRadius: 4,
      padding: 8,
    },
    totalsBox: {
      width: '40%',
      flexDirection: 'column',
    },
    totalLine: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingVertical: 3,
      fontSize: 9,
    },
    grandTotalLine: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      borderTopWidth: 2,
      borderTopColor: primaryColor,
      paddingTop: 5,
      marginTop: 4,
    },
    grandTotalLabel: {
      fontSize: 11,
      fontFamily: 'Helvetica-Bold',
      color: primaryColor,
    },
    grandTotalValue: {
      fontSize: 11,
      fontFamily: 'Helvetica-Bold',
      color: primaryColor,
    },

    footer: {
      position: 'absolute',
      bottom: 25,
      left: 30,
      right: 30,
      borderTopWidth: 1,
      borderTopColor: '#D6D3D1',
      paddingTop: 8,
      alignItems: 'center',
    },
    footerText: {
      fontSize: 9,
      fontFamily: 'Helvetica-Bold',
      color: primaryColor,
      textTransform: 'uppercase',
    },
    footerSubtext: {
      fontSize: 7,
      color: '#78716C',
      marginTop: 2,
    },
  });

  const formattedDate = fechaEmision || new Date().toLocaleDateString('es-HN');

  return (
    <Document title={`${tipo === 'VENTA' ? 'Venta' : 'Cotizacion'}-${numeroDocumento}`}>
      <Page size="LETTER" style={styles.page}>
        {/* Encabezado del Tenant & Documento */}
        <View style={styles.headerRow}>
          <View style={styles.companyBox}>
            {tenant.logoUrl ? (
              <Image src={tenant.logoUrl} style={styles.logo} />
            ) : null}
            <Text style={styles.companyName}>{tenant.nombreComercial}</Text>
            {tenant.direccion ? (
              <Text style={styles.companyMeta}>{tenant.direccion}</Text>
            ) : null}
            <Text style={styles.companyMeta}>
              {[
                tenant.telefono ? `Tel: ${tenant.telefono}` : null,
                tenant.email ? `Email: ${tenant.email}` : null,
              ]
                .filter(Boolean)
                .join(' • ')}
            </Text>
            {tenant.sucursal ? (
              <Text style={styles.companyMeta}>Sucursal: {tenant.sucursal}</Text>
            ) : null}
          </View>

          <View style={styles.docBox}>
            <Text style={styles.docTitle}>
              {tipo === 'VENTA' ? 'COMPROBANTE DE VENTA' : 'COTIZACIÓN PROFORMA'}
            </Text>
            <Text style={styles.docNumber}>
              {tipo === 'VENTA' ? `N° V-${numeroDocumento}` : `N° COT-${String(numeroDocumento).padStart(4, '0')}`}
            </Text>
            <Text style={styles.docMeta}>Fecha: {formattedDate}</Text>
            {tipo === 'COTIZACION' && fechaValidez ? (
              <Text style={{ ...styles.docMeta, color: primaryColor, fontFamily: 'Helvetica-Bold' }}>
                Válida hasta: {fechaValidez}
              </Text>
            ) : null}
          </View>
        </View>

        {/* Información de Cliente y Operación */}
        <View style={styles.infoGrid}>
          <View style={styles.infoCol}>
            <Text style={styles.infoLabel}>DATOS DEL CLIENTE</Text>
            <Text style={styles.infoValue}>
              <Text style={{ fontFamily: 'Helvetica-Bold' }}>Cliente: </Text>
              {clienteNombre}
            </Text>
            {clienteRtn ? (
              <Text style={styles.infoValue}>
                <Text style={{ fontFamily: 'Helvetica-Bold' }}>RTN: </Text>
                {clienteRtn}
              </Text>
            ) : null}
          </View>

          <View style={styles.infoCol}>
            <Text style={styles.infoLabel}>DATOS DE LA OPERACIÓN</Text>
            {vendedorNombre ? (
              <Text style={styles.infoValue}>
                <Text style={{ fontFamily: 'Helvetica-Bold' }}>Atendido por: </Text>
                {vendedorNombre}
              </Text>
            ) : null}
            {metodoPago ? (
              <Text style={styles.infoValue}>
                <Text style={{ fontFamily: 'Helvetica-Bold' }}>Método de Pago: </Text>
                {metodoPago}
              </Text>
            ) : null}
            {condicionesPago ? (
              <Text style={styles.infoValue}>
                <Text style={{ fontFamily: 'Helvetica-Bold' }}>Condiciones: </Text>
                {condicionesPago}
              </Text>
            ) : null}
          </View>
        </View>

        {/* Tabla de Productos */}
        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text style={[styles.tableHeaderCell, styles.colCode]}>CÓDIGO</Text>
            <Text style={[styles.tableHeaderCell, styles.colDesc]}>DESCRIPCIÓN</Text>
            <Text style={[styles.tableHeaderCell, styles.colQty]}>CANT.</Text>
            <Text style={[styles.tableHeaderCell, styles.colPrice]}>P. UNIT</Text>
            <Text style={[styles.tableHeaderCell, styles.colTotal]}>TOTAL</Text>
          </View>

          {items.map((item, index) => (
            <View key={index} style={styles.tableRow}>
              <Text style={[styles.tableCell, styles.colCode, { fontFamily: 'Helvetica-Bold' }]}>
                {item.codigo || '-'}
              </Text>
              <Text style={[styles.tableCell, styles.colDesc]}>
                {item.descripcion}
                {item.unidadMedida ? ` (${item.unidadMedida})` : ''}
              </Text>
              <Text style={[styles.tableCell, styles.colQty]}>{item.cantidad}</Text>
              <Text style={[styles.tableCell, styles.colPrice]}>
                {formatMoney(item.precioUnitario, currencySymbol)}
              </Text>
              <Text style={[styles.tableCell, styles.colTotal, { fontFamily: 'Helvetica-Bold' }]}>
                {formatMoney(item.totalLinea ?? item.subtotal, currencySymbol)}
              </Text>
            </View>
          ))}
        </View>

        {/* Totales y Notas */}
        <View style={styles.summaryRow}>
          <View style={styles.notesBox}>
            <Text style={styles.infoLabel}>OBSERVACIONES / NOTAS</Text>
            <Text style={{ fontSize: 8, color: '#57534E', lineHeight: 1.3 }}>
              {notas || (tipo === 'VENTA' ? '¡Gracias por su compra!' : 'Sujeto a cambios de stock o precio según validez.')}
            </Text>
          </View>

          <View style={styles.totalsBox}>
            <View style={styles.totalLine}>
              <Text style={{ color: '#78716C' }}>Subtotal:</Text>
              <Text style={{ fontFamily: 'Helvetica-Bold' }}>
                {formatMoney(subtotal, currencySymbol)}
              </Text>
            </View>

            {descuento > 0 ? (
              <View style={styles.totalLine}>
                <Text style={{ color: '#DC2626' }}>Descuento:</Text>
                <Text style={{ fontFamily: 'Helvetica-Bold', color: '#DC2626' }}>
                  -{formatMoney(descuento, currencySymbol)}
                </Text>
              </View>
            ) : null}

            <View style={styles.totalLine}>
              <Text style={{ color: '#78716C' }}>
                {taxName}{porcentajeIsv !== undefined && Number.isFinite(porcentajeIsv) ? ` (${porcentajeIsv}%, salvo exentos)` : ''}:
              </Text>
              <Text style={{ fontFamily: 'Helvetica-Bold' }}>
                {formatMoney(isv, currencySymbol)}
              </Text>
            </View>

            <View style={styles.grandTotalLine}>
              <Text style={styles.grandTotalLabel}>TOTAL:</Text>
              <Text style={styles.grandTotalValue}>
                {formatMoney(total, currencySymbol)}
              </Text>
            </View>
          </View>
        </View>

        {/* Pie de Página */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>
            {tipo === 'VENTA'
              ? 'Comprobante de venta'
              : `Cotización válida por ${diasValidez} días`}
          </Text>
          <Text style={styles.footerSubtext}>
            Documento generado por FerreSystem Multi-tenant SaaS
          </Text>
        </View>
      </Page>
    </Document>
  );
};

export const descargarReciboPDF = async (props: ReciboPDFProps, nombreArchivo: string) => {
  const doc = <ReciboPDF {...props} />;
  const blob = await pdf(doc).toBlob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = nombreArchivo;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};
