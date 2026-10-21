import { useCallback, useEffect, useState, type FormEvent } from 'react'
import {
  createMaterial,
  createMaterialTransaction,
  getMaterials,
  getMaterialTransactions,
  type Material,
  type MaterialTransaction,
  type Project,
} from './api'
import './MaterialsPage.css'

type MaterialsPageProps = {
  projects: Project[]
  selectedProjectId: number | null
}

type MaterialForm = {
  name: string
  unit: string
  opening_stock: string
  minimum_stock: string
  unit_price: string
  supplier: string
}

type TransactionForm = {
  material_id: string
  transaction_type: 'Received' | 'Used'
  quantity: string
  transaction_date: string
  notes: string
}

const emptyMaterialForm: MaterialForm = {
  name: '',
  unit: 'kg',
  opening_stock: '0',
  minimum_stock: '0',
  unit_price: '0',
  supplier: '',
}

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

const emptyTransactionForm: TransactionForm = {
  material_id: '',
  transaction_type: 'Received',
  quantity: '',
  transaction_date: today(),
  notes: '',
}

function formatCurrency(amount: number): string {
  return `₹${amount.toLocaleString('en-IN', {
    maximumFractionDigits: 2,
  })}`
}

function MaterialsPage({
  projects,
  selectedProjectId,
}: MaterialsPageProps) {
  const [projectId, setProjectId] = useState<number | null>(
    selectedProjectId,
  )
  const [materials, setMaterials] = useState<Material[]>([])
  const [transactions, setTransactions] = useState<MaterialTransaction[]>([])
  const [materialForm, setMaterialForm] =
    useState<MaterialForm>(emptyMaterialForm)
  const [transactionForm, setTransactionForm] =
    useState<TransactionForm>(emptyTransactionForm)
  const [loading, setLoading] = useState(false)
  const [savingMaterial, setSavingMaterial] = useState(false)
  const [savingTransaction, setSavingTransaction] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  useEffect(() => {
    setProjectId(selectedProjectId)
  }, [selectedProjectId])

  const loadData = useCallback(async () => {
    if (projectId === null) {
      setMaterials([])
      setTransactions([])
      setLoading(false)
      return
    }

    setLoading(true)
    setError('')

    try {
      const [materialData, transactionData] = await Promise.all([
        getMaterials(projectId),
        getMaterialTransactions({ projectId }),
      ])

      setMaterials(materialData)
      setTransactions(transactionData)

      setTransactionForm((current) => {
        const materialStillExists = materialData.some(
          (material) => String(material.id) === current.material_id,
        )

        return {
          ...current,
          material_id: materialStillExists
            ? current.material_id
            : materialData[0]
              ? String(materialData[0].id)
              : '',
        }
      })
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : 'Could not load materials.',
      )
    } finally {
      setLoading(false)
    }
  }, [projectId])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const totalInventoryValue = materials.reduce(
    (total, material) => total + material.stock_value,
    0,
  )

  const lowStockCount = materials.filter(
    (material) => Boolean(material.low_stock),
  ).length

  const totalMaterialTypes = materials.length

  async function handleCreateMaterial(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (projectId === null) {
      setError('Please select a project first.')
      return
    }

    setSavingMaterial(true)
    setError('')
    setMessage('')

    try {
      const created = await createMaterial({
        project_id: projectId,
        name: materialForm.name.trim(),
        unit: materialForm.unit.trim(),
        opening_stock: Number(materialForm.opening_stock),
        minimum_stock: Number(materialForm.minimum_stock),
        unit_price: Number(materialForm.unit_price),
        supplier: materialForm.supplier.trim() || null,
      })

      setMaterialForm(emptyMaterialForm)
      setTransactionForm((current) => ({
        ...current,
        material_id: String(created.id),
      }))
      setMessage(`${created.name} was registered successfully.`)
      await loadData()
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : 'Could not register material.',
      )
    } finally {
      setSavingMaterial(false)
    }
  }

  async function handleCreateTransaction(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault()

    if (!transactionForm.material_id) {
      setError('Register a material before recording stock movements.')
      return
    }

    setSavingTransaction(true)
    setError('')
    setMessage('')

    try {
      const saved = await createMaterialTransaction({
        material_id: Number(transactionForm.material_id),
        transaction_type: transactionForm.transaction_type,
        quantity: Number(transactionForm.quantity),
        transaction_date: transactionForm.transaction_date,
        notes: transactionForm.notes.trim() || null,
      })

      setMessage(
        `${saved.transaction_type} transaction recorded for ${saved.material_name}.`,
      )

      setTransactionForm((current) => ({
        ...current,
        quantity: '',
        notes: '',
      }))

      await loadData()
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : 'Could not record stock movement.',
      )
    } finally {
      setSavingTransaction(false)
    }
  }

  return (
    <div className="materials-page">
      <section className="materials-project-bar">
        <div>
          <h3>Inventory workspace</h3>
          <p>Track construction materials, stock movements, and suppliers.</p>
        </div>

        <label>
          Project
          <select
            value={projectId ?? ''}
            onChange={(event) =>
              setProjectId(event.target.value ? Number(event.target.value) : null)
            }
          >
            {projects.length === 0 && (
              <option value="">No projects available</option>
            )}

            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
        </label>
      </section>

      {error && (
        <div className="materials-message materials-error" role="alert">
          {error}
        </div>
      )}

      {message && (
        <div className="materials-message materials-success" role="status">
          {message}
        </div>
      )}

      <section className="materials-metrics">
        <article className="materials-metric">
          <span>Material types</span>
          <strong>{totalMaterialTypes}</strong>
          <p>Registered for this project</p>
        </article>

        <article className="materials-metric">
          <span>Inventory value</span>
          <strong>{formatCurrency(totalInventoryValue)}</strong>
          <p>Current quantity × unit price</p>
        </article>

        <article className="materials-metric">
          <span>Low-stock alerts</span>
          <strong className={lowStockCount > 0 ? 'low-stock-number' : ''}>
            {lowStockCount}
          </strong>
          <p>At or below minimum stock</p>
        </article>
      </section>

      <div className="materials-forms-grid">
        <section className="panel materials-panel">
          <div className="panel-heading">
            <div>
              <h3>Register material</h3>
              <p>Add a material and its opening stock.</p>
            </div>
          </div>

          <form className="materials-form" onSubmit={handleCreateMaterial}>
            <label>
              Material name
              <input
                required
                maxLength={150}
                value={materialForm.name}
                onChange={(event) =>
                  setMaterialForm((current) => ({
                    ...current,
                    name: event.target.value,
                  }))
                }
                placeholder="e.g. Cement"
              />
            </label>

            <div className="materials-input-row">
              <label>
                Unit
                <select
                  value={materialForm.unit}
                  onChange={(event) =>
                    setMaterialForm((current) => ({
                      ...current,
                      unit: event.target.value,
                    }))
                  }
                >
                  <option value="kg">Kilogram (kg)</option>
                  <option value="tonne">Tonne</option>
                  <option value="bag">Bag</option>
                  <option value="piece">Piece</option>
                  <option value="m3">Cubic metre (m³)</option>
                  <option value="litre">Litre</option>
                  <option value="metre">Metre</option>
                </select>
              </label>

              <label>
                Opening stock
                <input
                  required
                  type="number"
                  min="0"
                  step="any"
                  value={materialForm.opening_stock}
                  onChange={(event) =>
                    setMaterialForm((current) => ({
                      ...current,
                      opening_stock: event.target.value,
                    }))
                  }
                />
              </label>
            </div>

            <div className="materials-input-row">
              <label>
                Minimum stock
                <input
                  required
                  type="number"
                  min="0"
                  step="any"
                  value={materialForm.minimum_stock}
                  onChange={(event) =>
                    setMaterialForm((current) => ({
                      ...current,
                      minimum_stock: event.target.value,
                    }))
                  }
                />
              </label>

              <label>
                Unit price (₹)
                <input
                  required
                  type="number"
                  min="0"
                  step="any"
                  value={materialForm.unit_price}
                  onChange={(event) =>
                    setMaterialForm((current) => ({
                      ...current,
                      unit_price: event.target.value,
                    }))
                  }
                />
              </label>
            </div>

            <label>
              Supplier (optional)
              <input
                maxLength={150}
                value={materialForm.supplier}
                onChange={(event) =>
                  setMaterialForm((current) => ({
                    ...current,
                    supplier: event.target.value,
                  }))
                }
                placeholder="Supplier or vendor name"
              />
            </label>

            <button
              className="primary-button"
              type="submit"
              disabled={savingMaterial || projectId === null}
            >
              {savingMaterial ? 'Registering...' : 'Register material'}
            </button>
          </form>
        </section>

        <section className="panel materials-panel">
          <div className="panel-heading">
            <div>
              <h3>Record stock movement</h3>
              <p>Log material receipts and site usage.</p>
            </div>
          </div>

          <form
            className="materials-form"
            onSubmit={handleCreateTransaction}
          >
            <label>
              Material
              <select
                required
                value={transactionForm.material_id}
                onChange={(event) =>
                  setTransactionForm((current) => ({
                    ...current,
                    material_id: event.target.value,
                  }))
                }
                disabled={materials.length === 0}
              >
                {materials.length === 0 && (
                  <option value="">Register a material first</option>
                )}

                {materials.map((material) => (
                  <option key={material.id} value={material.id}>
                    {material.name} ({material.current_stock} {material.unit})
                  </option>
                ))}
              </select>
            </label>

            <div className="materials-input-row">
              <label>
                Movement type
                <select
                  value={transactionForm.transaction_type}
                  onChange={(event) =>
                    setTransactionForm((current) => ({
                      ...current,
                      transaction_type: event.target.value as
                        | 'Received'
                        | 'Used',
                    }))
                  }
                >
                  <option value="Received">Received</option>
                  <option value="Used">Used at site</option>
                </select>
              </label>

              <label>
                Quantity
                <input
                  required
                  type="number"
                  min="0.001"
                  step="any"
                  value={transactionForm.quantity}
                  onChange={(event) =>
                    setTransactionForm((current) => ({
                      ...current,
                      quantity: event.target.value,
                    }))
                  }
                  placeholder="Enter quantity"
                />
              </label>
            </div>

            <label>
              Transaction date
              <input
                required
                type="date"
                value={transactionForm.transaction_date}
                onChange={(event) =>
                  setTransactionForm((current) => ({
                    ...current,
                    transaction_date: event.target.value,
                  }))
                }
              />
            </label>

            <label>
              Notes (optional)
              <textarea
                rows={3}
                maxLength={1000}
                value={transactionForm.notes}
                onChange={(event) =>
                  setTransactionForm((current) => ({
                    ...current,
                    notes: event.target.value,
                  }))
                }
                placeholder="Delivery reference or usage details"
              />
            </label>

            <button
              className="primary-button"
              type="submit"
              disabled={savingTransaction || materials.length === 0}
            >
              {savingTransaction ? 'Recording...' : 'Record movement'}
            </button>
          </form>
        </section>
      </div>

      <section className="panel materials-panel">
        <div className="panel-heading materials-table-heading">
          <div>
            <h3>Current inventory</h3>
            <p>Stock balances update automatically after each movement.</p>
          </div>

          <button
            className="text-button"
            onClick={() => void loadData()}
            disabled={loading}
          >
            {loading ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>

        <div className="materials-table-wrap">
          <table className="materials-table">
            <thead>
              <tr>
                <th>Material</th>
                <th>Current stock</th>
                <th>Minimum</th>
                <th>Unit price</th>
                <th>Stock value</th>
                <th>Supplier</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {materials.map((material) => (
                <tr key={material.id}>
                  <td>
                    <strong>{material.name}</strong>
                    <small>{material.unit}</small>
                  </td>
                  <td>
                    {material.current_stock.toLocaleString('en-IN', {
                      maximumFractionDigits: 3,
                    })}{' '}
                    {material.unit}
                  </td>
                  <td>
                    {material.minimum_stock} {material.unit}
                  </td>
                  <td>{formatCurrency(material.unit_price)}</td>
                  <td>{formatCurrency(material.stock_value)}</td>
                  <td>{material.supplier || '—'}</td>
                  <td>
                    <span
                      className={
                        material.low_stock
                          ? 'stock-status stock-status-low'
                          : 'stock-status stock-status-ok'
                      }
                    >
                      {material.low_stock ? 'Low stock' : 'In stock'}
                    </span>
                  </td>
                </tr>
              ))}

              {!loading && materials.length === 0 && (
                <tr>
                  <td colSpan={7} className="materials-empty">
                    No materials registered for this project yet.
                  </td>
                </tr>
              )}

              {loading && (
                <tr>
                  <td colSpan={7} className="materials-empty">
                    Loading inventory...
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel materials-panel">
        <div className="panel-heading">
          <div>
            <h3>Stock movement history</h3>
            <p>Recent material receipts and usage for this project.</p>
          </div>
        </div>

        <div className="materials-table-wrap">
          <table className="materials-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Material</th>
                <th>Movement</th>
                <th>Quantity</th>
                <th>Transaction value</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((transaction) => (
                <tr key={transaction.id}>
                  <td>{transaction.transaction_date}</td>
                  <td>{transaction.material_name}</td>
                  <td>
                    <span
                      className={
                        transaction.transaction_type === 'Received'
                          ? 'stock-status stock-status-ok'
                          : 'stock-status stock-status-used'
                      }
                    >
                      {transaction.transaction_type}
                    </span>
                  </td>
                  <td>
                    {transaction.quantity} {transaction.unit}
                  </td>
                  <td>{formatCurrency(transaction.transaction_value)}</td>
                  <td>{transaction.notes || '—'}</td>
                </tr>
              ))}

              {!loading && transactions.length === 0 && (
                <tr>
                  <td colSpan={6} className="materials-empty">
                    No stock movements recorded yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}

export default MaterialsPage